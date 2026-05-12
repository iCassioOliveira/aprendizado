const state = {
  business: null,
  menu: [],
  orders: [],
  reservations: [],
  metrics: null,
  cart: new Map(),
  category: "Todos"
};

const THEME_KEY = "mesazap-theme";

const statusLabels = {
  novo: "Novo",
  confirmado: "Confirmado",
  preparando: "Preparando",
  saiu: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado"
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});

const metricCards = [
  {
    key: "revenue",
    label: "Faturamento hoje",
    icon: "R$",
    value: (metrics) => formatCurrency(metrics.todayRevenue),
    caption: (metrics) => `${metrics.todayOrders || 0} pedidos hoje`
  },
  {
    key: "orders",
    label: "Pedidos ativos",
    icon: "PD",
    value: (metrics) => metrics.activeOrders || 0,
    caption: () => "Ainda em atendimento"
  },
  {
    key: "ticket",
    label: "Ticket medio",
    icon: "TM",
    value: (metrics) => formatCurrency(metrics.averageTicket),
    caption: () => "Pedidos nao cancelados"
  },
  {
    key: "reservations",
    label: "Reservas hoje",
    icon: "RS",
    value: (metrics) => metrics.reservationsToday || 0,
    caption: (metrics) => `${metrics.pendingReservations || 0} pendentes`
  }
];

function $(selector) {
  return document.querySelector(selector);
}

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function formatDateTime(value) {
  return dateFormatter.format(new Date(value));
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}

function getInitialTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);

  if (savedTheme === "dark" || savedTheme === "light") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);

  const label = $("#themeToggleLabel");
  if (label) {
    label.textContent = theme === "dark" ? "Light" : "Dark";
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.dataset.theme || getInitialTheme();
  applyTheme(currentTheme === "dark" ? "light" : "dark");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Erro ao comunicar com a API.");
  }

  return payload;
}

async function loadState() {
  const payload = await api("/api/state");
  Object.assign(state, payload);
  render();
}

function setView(viewName) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelector(`#${viewName}View`).classList.add("active");

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === viewName);
  });
}

function render() {
  renderBusiness();
  renderCommandCenter();
  renderMetrics();
  renderSalesChart();
  renderChannels();
  renderStatusFlow();
  renderTopProducts();
  renderOrders();
  renderCategories();
  renderMenu();
  renderCart();
  renderReservations();
}

function renderBusiness() {
  if (!state.business) {
    return;
  }

  $("#businessName").textContent = state.business.name;
  $("#businessCategory").textContent = state.business.category;
  $("#businessMeta").textContent = `${state.business.address} - ${state.business.openingHours}`;
  const phone = String(state.business.whatsapp || "").replace(/\D/g, "");
  $("#whatsappLink").href = `https://wa.me/${phone}`;
}

function renderCommandCenter() {
  const metrics = state.metrics || {};
  $("#sidebarRevenue").textContent = formatCurrency(metrics.todayRevenue);
  $("#sidebarOrders").textContent = `${metrics.todayOrders || 0} pedidos`;
  $("#sidebarReservations").textContent = `${metrics.reservationsToday || 0} reservas`;
  $("#commandRevenue").textContent = formatCurrency(metrics.todayRevenue);
  $("#commandRevenueCaption").textContent = `${metrics.todayOrders || 0} pedidos hoje`;
  $("#commandQueue").textContent = metrics.activeOrders || 0;
  $("#commandReservations").textContent = metrics.reservationsToday || 0;
}

function renderMetrics() {
  const metricGrid = $("#metricGrid");
  const metrics = state.metrics || {};

  metricGrid.innerHTML = metricCards
    .map(
      (card) => `
        <article class="metric-card ${card.key}">
          <div class="metric-top">
            <span>${card.label}</span>
            <span class="metric-icon">${card.icon}</span>
          </div>
          <strong>${card.value(metrics)}</strong>
          <small>${card.caption(metrics)}</small>
        </article>
      `
    )
    .join("");
}

function renderSalesChart() {
  const chart = $("#salesChart");
  const sales = state.metrics?.dailySales || [];
  const maxRevenue = Math.max(...sales.map((day) => day.revenue), 1);

  chart.innerHTML = sales
    .map((day) => {
      const height = Math.max((day.revenue / maxRevenue) * 180, day.revenue > 0 ? 22 : 10);
      const label = day.date.slice(5).split("-").reverse().join("/");

      return `
        <div class="bar-column">
          <div class="bar-value">${formatCurrency(day.revenue)}</div>
          <div class="bar" style="height: ${height}px"></div>
          <div class="bar-label">${label}</div>
        </div>
      `;
    })
    .join("");
}

function renderChannels() {
  const channelList = $("#channelList");
  const counts = state.metrics?.channelCounts || {};
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0) || 1;

  channelList.innerHTML = Object.entries(counts)
    .map(([channel, count]) => {
      const label = channel === "whatsapp" ? "WhatsApp" : "Site";
      const percent = Math.round((count / total) * 100);
      return `
        <div>
          <div class="channel-row">
            <strong>${label}</strong>
            <span>${count} pedidos - ${percent}%</span>
          </div>
          <div class="channel-meter" aria-hidden="true"><span style="width: ${percent}%"></span></div>
        </div>
      `;
    })
    .join("");
}

function renderStatusFlow() {
  const statusFlow = $("#statusFlow");
  const counts = state.metrics?.statusCounts || {};
  const entries = Object.entries(statusLabels).map(([key, label]) => ({
    key,
    label,
    count: counts[key] || 0
  }));
  const maxCount = Math.max(...entries.map((entry) => entry.count), 1);

  statusFlow.innerHTML = entries
    .map((entry) => {
      const width = Math.max((entry.count / maxCount) * 100, entry.count > 0 ? 8 : 2);
      return `
        <div class="status-row">
          <div class="status-row-header">
            <strong>${entry.label}</strong>
            <span>${entry.count}</span>
          </div>
          <div class="status-meter" aria-hidden="true"><span style="width: ${width}%"></span></div>
        </div>
      `;
    })
    .join("");
}

function renderTopProducts() {
  const topProducts = $("#topProducts");
  const products = state.metrics?.topProducts || [];

  topProducts.innerHTML = products.length
    ? products
        .map(
          (product) => `
            <div class="ranking-row">
              <div>
                <strong>${product.name}</strong>
                <div class="muted">${product.quantity} vendidos</div>
              </div>
              <span>${formatCurrency(product.revenue)}</span>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state">Sem vendas registradas.</div>`;
}

function renderOrders() {
  const board = $("#ordersBoard");

  board.innerHTML = state.orders
    .map(
      (order) => `
        <article class="order-card status-${order.status}">
          <div class="order-card-header">
            <div>
              <strong>${order.id}</strong>
              <div class="muted">${formatDateTime(order.createdAt)}</div>
            </div>
            <span class="badge ${order.channel}">${order.channel === "whatsapp" ? "WhatsApp" : "Site"}</span>
          </div>
          <div class="order-meta">
            <span>${order.customer.name}</span>
            <span>${order.customer.phone}</span>
            <span>${order.fulfillment} - ${order.payment}</span>
          </div>
          <div class="order-lines">
            ${order.items
              .map(
                (item) => `
                  <div class="line-item">
                    <span>${item.quantity}x ${item.name}</span>
                    <strong>${formatCurrency(item.quantity * item.unitPrice)}</strong>
                  </div>
                `
              )
              .join("")}
          </div>
          <div class="checkout-total">
            <span>Total</span>
            <strong>${formatCurrency(order.total)}</strong>
          </div>
          <select class="status-select" data-order-id="${order.id}">
            ${Object.entries(statusLabels)
              .map(
                ([value, label]) => `<option value="${value}" ${order.status === value ? "selected" : ""}>${label}</option>`
              )
              .join("")}
          </select>
        </article>
      `
    )
    .join("");

  board.querySelectorAll(".status-select").forEach((select) => {
    select.addEventListener("change", async (event) => {
      await api(`/api/orders/${event.target.dataset.orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: event.target.value })
      });
      showToast("Status atualizado.");
      await loadState();
    });
  });
}

function slugCategory(category) {
  return String(category || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function renderCategories() {
  const filters = $("#categoryFilters");
  const categories = ["Todos", ...new Set(state.menu.map((item) => item.category))];

  filters.innerHTML = categories
    .map(
      (category) => `
        <button class="${state.category === category ? "active" : ""}" data-category="${category}" type="button">${category}</button>
      `
    )
    .join("");

  filters.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.category = button.dataset.category;
      renderCategories();
      renderMenu();
    });
  });
}

function renderMenu() {
  const menuGrid = $("#menuGrid");
  const products = state.category === "Todos"
    ? state.menu
    : state.menu.filter((item) => item.category === state.category);
  const availableCount = state.menu.filter((item) => item.available).length;

  $("#menuShowcaseMeta").textContent = `${availableCount} itens disponiveis`;

  menuGrid.innerHTML = products
    .map(
      (product) => {
        const categorySlug = slugCategory(product.category);
        return `
        <article class="menu-card">
          <div class="menu-card-visual" data-category="${categorySlug}">
            <span class="visual-label">${product.category}</span>
            <span class="visual-dish" aria-hidden="true"></span>
          </div>
          <div>
            <h3>${product.name}</h3>
            <p>${product.description}</p>
          </div>
          <div class="menu-tags">
            <span class="menu-tag">${product.prepMinutes} min</span>
            <span class="menu-tag">${product.featured ? "Destaque" : "Disponivel"}</span>
          </div>
          <div class="menu-card-footer">
            <div>
              <div class="price">${formatCurrency(product.price)}</div>
              <div class="muted">${product.available ? "Pronto para venda" : "Indisponivel"}</div>
            </div>
            <button class="add-button" data-product-id="${product.id}" type="button" title="Adicionar ${product.name}">+</button>
          </div>
        </article>
      `;
      }
    )
    .join("");

  menuGrid.querySelectorAll(".add-button").forEach((button) => {
    button.addEventListener("click", () => {
      addToCart(button.dataset.productId);
    });
  });
}

function addToCart(productId) {
  const current = state.cart.get(productId) || 0;
  state.cart.set(productId, current + 1);
  renderCart();
  showToast("Item adicionado ao carrinho.");
}

function updateCart(productId, quantity) {
  if (quantity <= 0) {
    state.cart.delete(productId);
  } else {
    state.cart.set(productId, quantity);
  }

  renderCart();
}

function getCartItems() {
  return Array.from(state.cart.entries())
    .map(([productId, quantity]) => {
      const product = state.menu.find((item) => item.id === productId);
      return product ? { product, quantity } : null;
    })
    .filter(Boolean);
}

function renderCart() {
  const cartList = $("#cartList");
  const cartItems = getCartItems();
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const total = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  $("#cartCount").textContent = `${itemCount} ${itemCount === 1 ? "item" : "itens"}`;
  $("#cartTotal").textContent = formatCurrency(total);

  cartList.innerHTML = cartItems.length
    ? cartItems
        .map(
          ({ product, quantity }) => `
            <div class="cart-item">
              <div>
                <strong>${product.name}</strong>
                <div class="muted">${formatCurrency(product.price)} cada</div>
              </div>
              <div class="quantity-controls">
                <button data-cart-action="decrease" data-product-id="${product.id}" type="button">-</button>
                <strong>${quantity}</strong>
                <button data-cart-action="increase" data-product-id="${product.id}" type="button">+</button>
              </div>
            </div>
          `
        )
        .join("")
    : `<div class="cart-empty">Escolha itens no cardapio.</div>`;

  cartList.querySelectorAll("[data-cart-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const productId = button.dataset.productId;
      const current = state.cart.get(productId) || 0;
      updateCart(productId, button.dataset.cartAction === "increase" ? current + 1 : current - 1);
    });
  });
}

function renderReservations() {
  const list = $("#reservationList");

  list.innerHTML = state.reservations.length
    ? state.reservations
        .map(
          (reservation) => `
            <div class="reservation-item">
              <div>
                <strong>${reservation.customer.name}</strong>
                <div class="muted">${reservation.customer.phone}</div>
                <div class="muted">${reservation.people} pessoas - ${reservation.notes || "Sem observacoes"}</div>
              </div>
              <div>
                <strong>${reservation.date}</strong>
                <div class="muted">${reservation.time} - ${reservation.status}</div>
              </div>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state">Nenhuma reserva recebida.</div>`;
}

async function submitCheckout(event) {
  event.preventDefault();
  const cartItems = getCartItems();

  if (!cartItems.length) {
    showToast("Adicione itens antes de finalizar.");
    return;
  }

  const formData = new FormData(event.target);
  await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      customer: {
        name: formData.get("name"),
        phone: formData.get("phone")
      },
      items: cartItems.map(({ product, quantity }) => ({
        productId: product.id,
        quantity
      })),
      fulfillment: formData.get("fulfillment"),
      payment: formData.get("payment"),
      notes: formData.get("notes")
    })
  });

  event.target.reset();
  state.cart.clear();
  showToast("Pedido enviado para o dashboard.");
  await loadState();
  setView("orders");
}

async function submitReservation(event) {
  event.preventDefault();
  const formData = new FormData(event.target);

  await api("/api/reservations", {
    method: "POST",
    body: JSON.stringify({
      customer: {
        name: formData.get("name"),
        phone: formData.get("phone")
      },
      date: formData.get("date"),
      time: formData.get("time"),
      people: Number(formData.get("people")),
      notes: formData.get("notes")
    })
  });

  event.target.reset();
  showToast("Reserva recebida.");
  await loadState();
}

async function simulateWhatsAppOrder() {
  const products = state.menu.filter((item) => item.available);
  const first = products[Math.floor(Math.random() * products.length)];
  const second = products[Math.floor(Math.random() * products.length)];

  await api("/api/whatsapp/orders", {
    method: "POST",
    body: JSON.stringify({
      customer: {
        name: "Cliente WhatsApp",
        phone: "+55 11 90000-0000"
      },
      items: [
        { productId: first.id, quantity: 1 },
        { productId: second.id, quantity: 1 }
      ],
      payment: "pix",
      fulfillment: "delivery",
      notes: "Pedido criado pela simulacao do chatbot."
    })
  });

  showToast("Pedido WhatsApp recebido.");
  await loadState();
}

function setupEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  $("#refreshButton").addEventListener("click", async () => {
    await loadState();
    showToast("Dados atualizados.");
  });

  $("#themeToggle").addEventListener("click", toggleTheme);
  $("#checkoutForm").addEventListener("submit", submitCheckout);
  $("#reservationForm").addEventListener("submit", submitReservation);
  $("#simulateWhatsAppOrder").addEventListener("click", simulateWhatsAppOrder);

  const dateInput = document.querySelector('input[name="date"]');
  dateInput.value = new Date().toISOString().slice(0, 10);
}

applyTheme(getInitialTheme());
setupEvents();
loadState().catch((error) => {
  console.error(error);
  showToast(error.message);
});
