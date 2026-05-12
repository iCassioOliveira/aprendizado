const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const DB_PATH = path.join(ROOT, "data", "db.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

const ORDER_STATUSES = ["novo", "confirmado", "preparando", "saiu", "entregue", "cancelado"];
const DATE_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: process.env.TZ || "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendError(res, statusCode, message, details) {
  sendJson(res, statusCode, { error: message, details });
}

async function readDatabase() {
  const raw = await fs.readFile(DB_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeDatabase(db) {
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2) + "\n", "utf8");
}

async function readRequestBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const parseError = new Error("JSON invalido.");
    parseError.statusCode = 400;
    throw parseError;
  }
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeText(value) {
  return String(value || "").trim();
}

function createId(prefix, records) {
  const max = records
    .map((record) => Number(String(record.id || "").replace(/\D/g, "")))
    .filter(Number.isFinite)
    .reduce((highest, current) => Math.max(highest, current), 0);

  return `${prefix}-${max + 1}`;
}

function buildOrderFromPayload(db, payload, channel) {
  const customer = payload.customer || {};
  const customerName = normalizeText(customer.name || payload.customerName);
  const customerPhone = normalizeText(customer.phone || payload.phone || payload.whatsapp);
  const fulfillment = normalizeText(payload.fulfillment || "delivery") || "delivery";
  const payment = normalizeText(payload.payment || "pix") || "pix";
  const notes = normalizeText(payload.notes);
  const incomingItems = Array.isArray(payload.items) ? payload.items : [];

  if (!customerName) {
    return { error: "Informe o nome do cliente." };
  }

  if (!customerPhone) {
    return { error: "Informe o telefone do cliente." };
  }

  if (!incomingItems.length) {
    return { error: "Inclua ao menos um item no pedido." };
  }

  const items = [];

  for (const item of incomingItems) {
    const product = db.menu.find((menuItem) => menuItem.id === item.productId);
    const quantity = Number(item.quantity || 1);

    if (!product) {
      return { error: `Produto nao encontrado: ${item.productId}` };
    }

    if (!product.available) {
      return { error: `Produto indisponivel: ${product.name}` };
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { error: `Quantidade invalida para ${product.name}.` };
    }

    items.push({
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice: money(product.price)
    });
  }

  const subtotal = money(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
  const deliveryFee = fulfillment === "delivery" ? money(db.business.deliveryFee) : 0;
  const total = money(subtotal + deliveryFee);

  return {
    id: createId("ORD", db.orders),
    channel,
    source: channel === "whatsapp" ? "ChatBot WhatsApp" : "Cardapio Digital",
    customer: {
      name: customerName,
      phone: customerPhone
    },
    items,
    subtotal,
    deliveryFee,
    total,
    status: "novo",
    payment,
    fulfillment,
    notes,
    createdAt: new Date().toISOString()
  };
}

function buildReservationFromPayload(db, payload) {
  const customer = payload.customer || {};
  const customerName = normalizeText(customer.name || payload.customerName);
  const customerPhone = normalizeText(customer.phone || payload.phone || payload.whatsapp);
  const date = normalizeText(payload.date);
  const time = normalizeText(payload.time);
  const people = Number(payload.people || payload.guests || 2);

  if (!customerName) {
    return { error: "Informe o nome do cliente." };
  }

  if (!customerPhone) {
    return { error: "Informe o telefone do cliente." };
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Informe uma data valida no formato AAAA-MM-DD." };
  }

  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    return { error: "Informe um horario valido no formato HH:MM." };
  }

  if (!Number.isFinite(people) || people <= 0) {
    return { error: "Informe a quantidade de pessoas." };
  }

  return {
    id: createId("RES", db.reservations),
    customer: {
      name: customerName,
      phone: customerPhone
    },
    date,
    time,
    people,
    status: "solicitada",
    notes: normalizeText(payload.notes),
    createdAt: new Date().toISOString()
  };
}

function getLocalDay(dateString) {
  return DATE_KEY_FORMATTER.format(new Date(dateString));
}

function calculateMetrics(db) {
  const now = new Date();
  const today = getLocalDay(now);
  const last7Days = new Date(now);
  last7Days.setDate(now.getDate() - 6);
  last7Days.setHours(0, 0, 0, 0);

  const activeOrders = db.orders.filter((order) => !["entregue", "cancelado"].includes(order.status));
  const completedOrders = db.orders.filter((order) => order.status !== "cancelado");
  const todayOrders = db.orders.filter((order) => getLocalDay(order.createdAt) === today);
  const todayRevenue = todayOrders
    .filter((order) => order.status !== "cancelado")
    .reduce((sum, order) => sum + Number(order.total || 0), 0);
  const revenue = completedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const averageTicket = completedOrders.length ? revenue / completedOrders.length : 0;

  const statusCounts = ORDER_STATUSES.reduce((acc, status) => {
    acc[status] = db.orders.filter((order) => order.status === status).length;
    return acc;
  }, {});

  const channelCounts = db.orders.reduce((acc, order) => {
    acc[order.channel] = (acc[order.channel] || 0) + 1;
    return acc;
  }, {});

  const productMap = new Map();
  for (const order of db.orders) {
    if (order.status === "cancelado") {
      continue;
    }

    for (const item of order.items) {
      const current = productMap.get(item.productId) || {
        id: item.productId,
        name: item.name,
        quantity: 0,
        revenue: 0
      };

      current.quantity += Number(item.quantity || 0);
      current.revenue += Number(item.quantity || 0) * Number(item.unitPrice || 0);
      productMap.set(item.productId, current);
    }
  }

  const topProducts = Array.from(productMap.values())
    .map((product) => ({ ...product, revenue: money(product.revenue) }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  const dailySales = [];
  for (let index = 0; index < 7; index += 1) {
    const day = new Date(last7Days);
    day.setDate(last7Days.getDate() + index);
    const key = getLocalDay(day);
    const orders = db.orders.filter((order) => getLocalDay(order.createdAt) === key && order.status !== "cancelado");

    dailySales.push({
      date: key,
      orders: orders.length,
      revenue: money(orders.reduce((sum, order) => sum + Number(order.total || 0), 0))
    });
  }

  const reservationsToday = db.reservations.filter((reservation) => reservation.date === today);

  return {
    today,
    totalOrders: db.orders.length,
    activeOrders: activeOrders.length,
    todayOrders: todayOrders.length,
    todayRevenue: money(todayRevenue),
    revenue: money(revenue),
    averageTicket: money(averageTicket),
    pendingReservations: db.reservations.filter((reservation) => reservation.status === "solicitada").length,
    reservationsToday: reservationsToday.length,
    statusCounts,
    channelCounts,
    topProducts,
    dailySales
  };
}

async function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendError(res, 403, "Acesso negado.");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      const fallback = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(fallback);
      return;
    }

    throw error;
  }
}

async function handleApi(req, res, pathname) {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  const db = await readDatabase();

  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true, service: "mesa-zap-pro" });
    return;
  }

  if (req.method === "GET" && pathname === "/api/state") {
    sendJson(res, 200, {
      business: db.business,
      menu: db.menu,
      orders: db.orders,
      reservations: db.reservations,
      metrics: calculateMetrics(db)
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/menu") {
    sendJson(res, 200, db.menu);
    return;
  }

  if (req.method === "GET" && pathname === "/api/orders") {
    sendJson(res, 200, db.orders);
    return;
  }

  if (req.method === "GET" && pathname === "/api/reservations") {
    sendJson(res, 200, db.reservations);
    return;
  }

  if (req.method === "GET" && pathname === "/api/metrics") {
    sendJson(res, 200, calculateMetrics(db));
    return;
  }

  if (req.method === "POST" && ["/api/orders", "/api/whatsapp/orders"].includes(pathname)) {
    const payload = await readRequestBody(req);
    const channel = pathname.includes("whatsapp") ? "whatsapp" : "site";
    const order = buildOrderFromPayload(db, payload, channel);

    if (order.error) {
      sendError(res, 422, order.error);
      return;
    }

    db.orders.unshift(order);
    await writeDatabase(db);
    sendJson(res, 201, { order, metrics: calculateMetrics(db) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/reservations") {
    const payload = await readRequestBody(req);
    const reservation = buildReservationFromPayload(db, payload);

    if (reservation.error) {
      sendError(res, 422, reservation.error);
      return;
    }

    db.reservations.unshift(reservation);
    await writeDatabase(db);
    sendJson(res, 201, { reservation, metrics: calculateMetrics(db) });
    return;
  }

  const statusMatch = pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
  if (req.method === "PATCH" && statusMatch) {
    const payload = await readRequestBody(req);
    const status = normalizeText(payload.status);
    const order = db.orders.find((item) => item.id === statusMatch[1]);

    if (!order) {
      sendError(res, 404, "Pedido nao encontrado.");
      return;
    }

    if (!ORDER_STATUSES.includes(status)) {
      sendError(res, 422, "Status invalido.", { allowed: ORDER_STATUSES });
      return;
    }

    order.status = status;
    order.updatedAt = new Date().toISOString();
    await writeDatabase(db);
    sendJson(res, 200, { order, metrics: calculateMetrics(db) });
    return;
  }

  sendError(res, 404, "Rota nao encontrada.");
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }

    await serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    sendError(res, error.statusCode || 500, error.message || "Erro interno.");
  }
});

server.listen(PORT, () => {
  console.log(`MesaZap Pro rodando em http://localhost:${PORT}`);
});
