// Browser side of the shop: the order request kept in this browser
// (localStorage), the product gallery, and sending the order form as JSON.
// Every page works without this file; it only makes the order form nicer.
// Nothing here talks to Busabase: it calls this site's own /api/orders.

const CART_KEY = "busa-shop-order-request-v1";
const ORDER_ID_KEY = "busa-shop-order-id-v1";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const readCart = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.productId === "string" && Number.isInteger(item.quantity) && item.quantity > 0)
      : [];
  } catch {
    return [];
  }
};

const writeCart = (items) => {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {
    // Private mode or storage full: the order still works for this page view.
  }
  showCartCount(items);
};

const addToCart = (productId, quantity) => {
  const items = readCart();
  const existing = items.find((item) => item.productId === productId);
  if (existing) existing.quantity += quantity;
  else items.push({ productId, quantity });
  writeCart(items);
};

const showCartCount = (items = readCart()) => {
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  for (const badge of document.querySelectorAll("[data-cart-count]")) {
    badge.textContent = count ? String(count) : "";
    badge.hidden = count === 0;
  }
};

// One id per order request, made here before the first send and kept until it
// succeeds: a double click or a retry sends the same id, and the shop saves it once.
const orderId = () => {
  let id = "";
  try {
    id = sessionStorage.getItem(ORDER_ID_KEY) || "";
  } catch {
    id = "";
  }
  if (/^ORD-[0-9A-HJKMNP-TV-Z]{10}$/.test(id)) return id;
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  id = `ORD-${Array.from(bytes, (byte) => CROCKFORD[byte % 32]).join("")}`;
  try {
    sessionStorage.setItem(ORDER_ID_KEY, id);
  } catch {
    // Without storage the id lives as long as this page.
  }
  return id;
};

const forgetOrderId = () => {
  try {
    sessionStorage.removeItem(ORDER_ID_KEY);
  } catch {
    // nothing to forget
  }
};

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));

// ---- Product page ----

for (const form of document.querySelectorAll("[data-add-form]")) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const quantity = Math.max(1, Math.trunc(Number(data.get("qty")) || 1));
    addToCart(String(data.get("add")), quantity);
    // The form's own action, not a literal "/order": in the members-only preview
    // Busabase serves the site under a sub-path and rewrites that attribute.
    window.location.assign(form.action);
  });
}

const galleryMain = document.querySelector("[data-gallery-main] img");
for (const thumb of document.querySelectorAll("[data-gallery-thumb]")) {
  thumb.addEventListener("click", (event) => {
    if (!galleryMain) return;
    event.preventDefault();
    galleryMain.src = thumb.getAttribute("href");
  });
}

// ---- Order page ----

const dataElement = document.getElementById("shop-data");
const form = document.querySelector("[data-order-form]");

if (dataElement && form) {
  const data = JSON.parse(dataElement.textContent);
  const messages = data.messages;
  let products = new Map(data.products.map((product) => [product.id, product]));
  const itemsBox = form.querySelector("[data-order-items]");
  const totalBox = form.querySelector("[data-order-total]");
  const statusBox = form.querySelector("[data-form-status]");
  const submit = form.querySelector("[data-submit]");
  const thanks = document.querySelector("[data-thanks]");
  const locale = { en: "en-US", de: "de-DE", fr: "fr-FR", es: "es-ES" }[data.language] || "en-US";
  const money = (amount) => {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: data.currency }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${data.currency}`;
    }
  };

  // What the page was opened with (?add=…, or rows the server re-rendered) joins the saved request.
  const params = new URLSearchParams(window.location.search);
  if (params.get("add")) {
    addToCart(params.get("add"), Math.max(1, Math.trunc(Number(params.get("qty")) || 1)));
    history.replaceState(null, "", window.location.pathname);
  } else {
    for (const input of itemsBox.querySelectorAll('input[name^="qty."]')) {
      const productId = input.name.slice(4);
      if (!readCart().some((item) => item.productId === productId)) addToCart(productId, Math.max(1, Number(input.value) || 1));
    }
  }

  const setStatus = (message, isError) => {
    statusBox.textContent = message;
    statusBox.hidden = !message;
    statusBox.classList.toggle("is-error", Boolean(isError));
  };

  const clearFieldErrors = () => {
    for (const box of form.querySelectorAll("[data-error-for]")) {
      box.hidden = true;
      box.textContent = "";
    }
    for (const field of form.querySelectorAll("[aria-invalid]")) field.removeAttribute("aria-invalid");
  };

  const showFieldError = (name, message) => {
    const box = form.querySelector(`[data-error-for="${name}"]`);
    if (box) {
      box.textContent = message;
      box.hidden = false;
    }
    const field = form.elements.namedItem(name);
    if (field && "setAttribute" in field) field.setAttribute("aria-invalid", "true");
  };

  // Drop what can no longer be ordered and clamp to what is in stock.
  const currentItems = () => {
    const items = [];
    let dropped = false;
    for (const item of readCart()) {
      const product = products.get(item.productId);
      if (!product || product.soldOut || product.maxQuantity < 1) {
        dropped = true;
        continue;
      }
      items.push({ productId: item.productId, quantity: Math.min(item.quantity, product.maxQuantity) });
    }
    if (dropped) writeCart(items);
    return { items, dropped };
  };

  const totalOf = (items) =>
    items.reduce((sum, item) => sum + Math.round(products.get(item.productId).price * 100) * item.quantity, 0) / 100;

  const render = () => {
    const { items, dropped } = currentItems();
    itemsBox.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = messages.order_empty;
      itemsBox.append(empty);
    }
    for (const item of items) {
      const product = products.get(item.productId);
      const row = document.createElement("div");
      row.className = "order-row";
      const name = document.createElement("span");
      name.className = "order-name";
      name.textContent = product.name;
      const unit = document.createElement("span");
      unit.className = "order-unit";
      unit.textContent = product.priceText;
      const label = document.createElement("label");
      label.className = "qty";
      const hidden = document.createElement("span");
      hidden.className = "visually-hidden";
      hidden.textContent = messages.quantity;
      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.max = String(product.maxQuantity);
      input.value = String(item.quantity);
      input.inputMode = "numeric";
      input.name = `qty.${product.id}`;
      input.addEventListener("change", () => {
        const quantity = Math.max(1, Math.min(product.maxQuantity, Math.trunc(Number(input.value) || 1)));
        writeCart(readCart().map((entry) => (entry.productId === product.id ? { ...entry, quantity } : entry)));
        render();
      });
      label.append(hidden, input);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "link-button";
      remove.textContent = messages.order_remove;
      remove.addEventListener("click", () => {
        writeCart(readCart().filter((entry) => entry.productId !== product.id));
        render();
      });
      row.append(name, unit, label, remove);
      itemsBox.append(row);
    }
    const total = totalOf(items);
    totalBox.textContent = money(total);
    form.elements.namedItem("expectedTotal").value = total.toFixed(2);
    if (dropped) setStatus(messages.error_not_available, true);
    return items;
  };

  form.elements.namedItem("orderId").value = orderId();
  render();

  const itemMessage = (itemError) => {
    if (!itemError) return messages.error_invalid;
    const product = products.get(itemError.productId);
    const name = itemError.name || product?.name || itemError.productId;
    if (itemError.code === "too_many") return fill(messages.error_too_many, { name, max: itemError.max });
    if (itemError.code === "sold_out") return fill(messages.error_sold_out, { name });
    return messages.error_not_available;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFieldErrors();
    const items = render();
    if (!items.length) {
      showFieldError("items", messages.error_items_empty);
      return;
    }
    const fields = new FormData(form);
    const body = {
      orderId: form.elements.namedItem("orderId").value,
      name: String(fields.get("name") || ""),
      email: String(fields.get("email") || ""),
      phone: String(fields.get("phone") || ""),
      country: String(fields.get("country") || ""),
      note: String(fields.get("note") || ""),
      website: String(fields.get("company_url") || ""),
      items,
      expectedTotal: totalOf(items),
    };
    submit.disabled = true;
    submit.textContent = messages.sending;
    setStatus("", false);
    let response;
    let result = {};
    try {
      response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
      });
      result = await response.json().catch(() => ({}));
    } catch {
      response = null;
    }
    submit.disabled = false;
    submit.textContent = messages.submit;

    if (response?.ok && result.ok) {
      writeCart([]);
      forgetOrderId();
      form.hidden = true;
      thanks.replaceChildren();
      const title = document.createElement("h2");
      title.textContent = messages.thanks_title;
      const text = document.createElement("p");
      text.textContent = fill(messages.thanks_body, { orderId: result.orderId, email: body.email });
      const link = document.createElement("a");
      link.className = "button";
      link.href = "./"; // relative: the shop's home here, and under the preview's sub-path too
      link.textContent = messages.thanks_continue;
      const linkLine = document.createElement("p");
      linkLine.append(link);
      thanks.append(title, text, linkLine);
      thanks.hidden = false;
      thanks.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (response?.status === 409 && Array.isArray(result.products)) {
      products = new Map(result.products.map((product) => [product.id, product]));
      render();
      setStatus(fill(messages.error_price_changed, { total: result.totalText || "" }), true);
      return;
    }

    if (response?.status === 400 && result.errors) {
      const itemErrors = Array.isArray(result.itemErrors) ? result.itemErrors : [];
      const gone = new Set(itemErrors.filter((item) => item.code === "not_available").map((item) => item.productId));
      if (gone.size) {
        writeCart(readCart().filter((entry) => !gone.has(entry.productId)));
        render();
      }
      for (const [name, code] of Object.entries(result.errors)) {
        if (name === "items") {
          showFieldError("items", itemErrors.length ? itemMessage(itemErrors[0]) : messages[`error_${code}`] || messages.error_invalid);
        } else if (name !== "orderId") {
          showFieldError(name, messages[`error_${code}`] || messages.error_invalid);
        }
      }
      if (result.errors.orderId) {
        forgetOrderId();
        form.elements.namedItem("orderId").value = orderId();
      }
      setStatus(messages.error_fix, true);
      return;
    }

    // Nothing was saved (or we cannot tell): keep everything, including the
    // order id, so trying again cannot create a second order.
    const contact = data.contactEmail ? ` ${fill(messages.error_unavailable_contact, { email: data.contactEmail })}` : "";
    setStatus(`${messages.error_unavailable}${contact}`, true);
  });
}

showCartCount();
