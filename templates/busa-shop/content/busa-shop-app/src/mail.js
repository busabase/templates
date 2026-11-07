// The shop's emails, in the store's language (Settings › Language), and the
// SMTP settings they are sent with. Pure (test/mail.test.mjs); sending is
// src/smtp.js, called from src/handler.js after the order is saved, so a slow
// or broken mail server can never block an order or a payment.
//
//   request-received  buyer   an order request was saved (no online payment)
//   payment-receipt   buyer   PayPal confirmed the payment: order confirmed
//   owner-request     owner   a new order request
//   owner-paid        owner   a new paid order, ready to ship
//   owner-problem     owner   PayPal denied, reversed, or paid the wrong amount
//
// The buyer's order-request email carries nothing the visitor typed except
// their address itself (no name, note or street): anyone can fill in the order
// form with someone else's address, and this way that person only learns that
// a request in their name exists, with this shop's products and prices. Once
// PayPal has taken a payment, the receipt says everything.

import { formatPrice } from "./catalog.js";
import { isSafeAddress } from "./smtp.js";

const en = {
  hello: "Hello,",
  hello_name: "Hello {name},",
  request_subject: "We received your order request {orderId}",
  request_intro:
    "Thank you for your order request at {store}. Nothing has been charged: we will reply to this address to confirm availability and arrange payment.",
  receipt_subject: "Order {orderId} confirmed: payment received",
  receipt_intro: "Thank you for your order at {store}. We have received your payment of {amount} through PayPal.",
  receipt_next: "We will email you again when your order ships.",
  items: "Items",
  subtotal: "Items total",
  shipping: "Shipping",
  shipping_free: "Free",
  shipping_tbc: "to be confirmed",
  total: "Total",
  total_paid: "Total paid",
  order_id: "Order",
  paypal_id: "PayPal transaction",
  ship_to: "Ship to",
  delivery: "Delivery time",
  questions: "Questions? Reply to this email or write to {email}.",
  questions_reply: "Questions? Reply to this email.",
  owner_request_subject: "New order request {orderId} · {total}",
  owner_request_intro:
    "A new order request came in through your shop. It is not paid: reply to the customer to confirm it and arrange payment, then set it to Confirmed in Orders.",
  owner_paid_subject: "New paid order {orderId} · {amount}",
  owner_paid_intro: "PayPal confirmed a payment for this order. It is in Orders › To ship.",
  owner_problem_subject: "Payment problem on order {orderId}",
  owner_problem_intro: "PayPal reported something about this order that needs you:",
  owner_problem_next: "Look at the payment in your PayPal account before you ship anything.",
  customer: "Customer",
  email: "Email",
  phone: "Phone",
  note: "Customer note",
  auto_note: "Sent automatically by the {store} website.",
};

const de = {
  hello: "Hallo,",
  hello_name: "Hallo {name},",
  request_subject: "Wir haben Ihre Bestellanfrage {orderId} erhalten",
  request_intro:
    "Vielen Dank für Ihre Bestellanfrage bei {store}. Es wurde nichts abgebucht: Wir antworten an diese Adresse, um die Verfügbarkeit zu bestätigen und die Zahlung zu vereinbaren.",
  receipt_subject: "Bestellung {orderId} bestätigt: Zahlung erhalten",
  receipt_intro: "Vielen Dank für Ihre Bestellung bei {store}. Wir haben Ihre Zahlung über {amount} per PayPal erhalten.",
  receipt_next: "Wir schreiben Ihnen wieder, sobald Ihre Bestellung versandt ist.",
  items: "Artikel",
  subtotal: "Warenwert",
  shipping: "Versand",
  shipping_free: "Kostenlos",
  shipping_tbc: "wird bestätigt",
  total: "Gesamt",
  total_paid: "Bezahlt",
  order_id: "Bestellung",
  paypal_id: "PayPal-Transaktion",
  ship_to: "Lieferadresse",
  delivery: "Lieferzeit",
  questions: "Fragen? Antworten Sie auf diese E-Mail oder schreiben Sie an {email}.",
  questions_reply: "Fragen? Antworten Sie einfach auf diese E-Mail.",
  owner_request_subject: "Neue Bestellanfrage {orderId} · {total}",
  owner_request_intro:
    "Über Ihren Shop ist eine neue Bestellanfrage eingegangen. Sie ist nicht bezahlt: Antworten Sie dem Kunden, um sie zu bestätigen und die Zahlung zu vereinbaren, und setzen Sie sie dann in Orders auf Confirmed.",
  owner_paid_subject: "Neue bezahlte Bestellung {orderId} · {amount}",
  owner_paid_intro: "PayPal hat eine Zahlung für diese Bestellung bestätigt. Sie steht in Orders › To ship.",
  owner_problem_subject: "Zahlungsproblem bei Bestellung {orderId}",
  owner_problem_intro: "PayPal meldet zu dieser Bestellung etwas, das Sie ansehen müssen:",
  owner_problem_next: "Prüfen Sie die Zahlung in Ihrem PayPal-Konto, bevor Sie etwas versenden.",
  customer: "Kunde",
  email: "E-Mail",
  phone: "Telefon",
  note: "Anmerkung des Kunden",
  auto_note: "Automatisch von der Website von {store} gesendet.",
};

const fr = {
  hello: "Bonjour,",
  hello_name: "Bonjour {name},",
  request_subject: "Nous avons reçu votre demande de commande {orderId}",
  request_intro:
    "Merci pour votre demande de commande chez {store}. Rien n'a été débité : nous répondrons à cette adresse pour confirmer la disponibilité et organiser le paiement.",
  receipt_subject: "Commande {orderId} confirmée : paiement reçu",
  receipt_intro: "Merci pour votre commande chez {store}. Nous avons bien reçu votre paiement de {amount} via PayPal.",
  receipt_next: "Nous vous écrirons à nouveau lorsque votre commande sera expédiée.",
  items: "Articles",
  subtotal: "Total des articles",
  shipping: "Livraison",
  shipping_free: "Gratuite",
  shipping_tbc: "à confirmer",
  total: "Total",
  total_paid: "Total payé",
  order_id: "Commande",
  paypal_id: "Transaction PayPal",
  ship_to: "Livrer à",
  delivery: "Délai de livraison",
  questions: "Des questions ? Répondez à cet e-mail ou écrivez à {email}.",
  questions_reply: "Des questions ? Répondez simplement à cet e-mail.",
  owner_request_subject: "Nouvelle demande de commande {orderId} · {total}",
  owner_request_intro:
    "Une nouvelle demande de commande est arrivée par votre boutique. Elle n'est pas payée : répondez au client pour la confirmer et organiser le paiement, puis passez-la à Confirmed dans Orders.",
  owner_paid_subject: "Nouvelle commande payée {orderId} · {amount}",
  owner_paid_intro: "PayPal a confirmé un paiement pour cette commande. Elle se trouve dans Orders › To ship.",
  owner_problem_subject: "Problème de paiement sur la commande {orderId}",
  owner_problem_intro: "PayPal signale sur cette commande quelque chose qui demande votre attention :",
  owner_problem_next: "Vérifiez le paiement dans votre compte PayPal avant d'expédier quoi que ce soit.",
  customer: "Client",
  email: "E-mail",
  phone: "Téléphone",
  note: "Note du client",
  auto_note: "Envoyé automatiquement par le site de {store}.",
};

const es = {
  hello: "Hola:",
  hello_name: "Hola, {name}:",
  request_subject: "Hemos recibido tu solicitud de pedido {orderId}",
  request_intro:
    "Gracias por tu solicitud de pedido en {store}. No se ha cobrado nada: responderemos a esta dirección para confirmar la disponibilidad y acordar el pago.",
  receipt_subject: "Pedido {orderId} confirmado: pago recibido",
  receipt_intro: "Gracias por tu pedido en {store}. Hemos recibido tu pago de {amount} a través de PayPal.",
  receipt_next: "Te escribiremos de nuevo cuando enviemos tu pedido.",
  items: "Artículos",
  subtotal: "Total de artículos",
  shipping: "Envío",
  shipping_free: "Gratis",
  shipping_tbc: "por confirmar",
  total: "Total",
  total_paid: "Total pagado",
  order_id: "Pedido",
  paypal_id: "Transacción de PayPal",
  ship_to: "Enviar a",
  delivery: "Plazo de entrega",
  questions: "¿Preguntas? Responde a este correo o escribe a {email}.",
  questions_reply: "¿Preguntas? Responde a este correo.",
  owner_request_subject: "Nueva solicitud de pedido {orderId} · {total}",
  owner_request_intro:
    "Ha llegado una nueva solicitud de pedido por tu tienda. No está pagada: responde al cliente para confirmarla y acordar el pago, y después márcala como Confirmed en Orders.",
  owner_paid_subject: "Nuevo pedido pagado {orderId} · {amount}",
  owner_paid_intro: "PayPal ha confirmado un pago para este pedido. Está en Orders › To ship.",
  owner_problem_subject: "Problema de pago en el pedido {orderId}",
  owner_problem_intro: "PayPal ha comunicado algo sobre este pedido que necesita tu atención:",
  owner_problem_next: "Revisa el pago en tu cuenta de PayPal antes de enviar nada.",
  customer: "Cliente",
  email: "Correo",
  phone: "Teléfono",
  note: "Nota del cliente",
  auto_note: "Enviado automáticamente por la web de {store}.",
};

export const EMAIL_MESSAGES = { en, de, fr, es };

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

/**
 * What sending needs, from Settings and the Vault. `{ ready: true, … }` or
 * `{ ready: false, reason }`, where reason is one of `off` (no SMTP host),
 * `no-sender`, `no-password`, `bad-port`, `browser-engine`.
 */
export const smtpConfig = (settings, secrets, { canConnect = true } = {}) => {
  const host = settings.smtpHost;
  if (!host) return { ready: false, reason: "off" };
  if (!canConnect) return { ready: false, reason: "browser-engine" };
  const port = settings.smtpPort ?? (settings.smtpSecurity === "tls" ? 465 : 587);
  if (!Number.isInteger(port) || port <= 0 || port > 65535 || port === 25) return { ready: false, reason: "bad-port" };
  const from = settings.emailFrom || settings.smtpUsername;
  if (!isSafeAddress(from)) return { ready: false, reason: "no-sender" };
  const password = secrets?.smtpPassword ?? "";
  if (settings.smtpUsername && settings.smtpSecurity !== "none" && !password) return { ready: false, reason: "no-password" };
  const notify = isSafeAddress(settings.notifyEmail) ? settings.notifyEmail : isSafeAddress(settings.contactEmail) ? settings.contactEmail : "";
  return {
    ready: true,
    host,
    port,
    security: settings.smtpSecurity,
    username: settings.smtpUsername,
    password,
    from,
    fromName: settings.storeName,
    notify,
  };
};

const money = (amount, settings) => formatPrice(amount, settings.currency, settings.language);

const lineText = (line, settings) => `${line.quantity} × ${line.name}${line.sku ? ` (${line.sku})` : ""}: ${money(line.lineTotal, settings)}`;

/** The order's figures, as label/value rows, the same in the text and the HTML version. */
const totals = (order, settings, t, { paid = false } = {}) => [
  [t.subtotal, money(order.subtotal ?? order.total, settings)],
  [t.shipping, order.shipping === null || order.shipping === undefined ? t.shipping_tbc : order.shipping === 0 ? t.shipping_free : money(order.shipping, settings)],
  [paid ? t.total_paid : t.total, money(paid && Number.isFinite(order.amountPaid) ? order.amountPaid : order.total, settings)],
];

const addressLines = (order) => {
  const address = order.address ?? {};
  return [
    order.name,
    address.line1,
    address.line2,
    [address.postalCode, address.city].filter(Boolean).join(" "),
    address.region,
    order.countryLabel ?? address.country,
  ].filter(Boolean);
};

const render = ({ t, settings, greeting, intro, sections, closing }) => {
  const footer = [settings.contactEmail ? fill(t.questions, { email: settings.contactEmail }) : t.questions_reply, settings.storeName].filter(Boolean);
  const text = [
    greeting,
    "",
    ...intro,
    "",
    ...sections.flatMap((section) => [`${section.title}:`, ...section.lines.map((line) => (Array.isArray(line) ? `${line[0]}: ${line[1]}` : `  ${line}`)), ""]),
    ...closing,
    ...(closing.length ? [""] : []),
    ...footer,
    "",
    "--",
    fill(t.auto_note, { store: settings.storeName }),
    "",
  ].join("\n");
  const htmlSection = (section) =>
    `<h3 style="margin:20px 0 6px;font-size:15px">${escapeHtml(section.title)}</h3>` +
    (section.lines.some(Array.isArray)
      ? `<table style="border-collapse:collapse">${section.lines
          .map((line) =>
            Array.isArray(line)
              ? `<tr><td style="padding:2px 16px 2px 0;color:#555">${escapeHtml(line[0])}</td><td style="padding:2px 0"><strong>${escapeHtml(line[1])}</strong></td></tr>`
              : `<tr><td colspan="2" style="padding:2px 0">${escapeHtml(line)}</td></tr>`,
          )
          .join("")}</table>`
      : `<p style="margin:0">${section.lines.map(escapeHtml).join("<br>")}</p>`);
  const html = `<!doctype html><html lang="${escapeHtml(settings.language)}"><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f2328;max-width:600px">
<p>${escapeHtml(greeting)}</p>
${intro.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n")}
${sections.map(htmlSection).join("\n")}
${closing.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n")}
<p>${footer.map(escapeHtml).join("<br>")}</p>
<p style="color:#777;font-size:12px">${escapeHtml(fill(t.auto_note, { store: settings.storeName }))}</p>
</body></html>`;
  return { text, html };
};

/**
 * The emails for one moment of an order. `kind` is `request` (an order request
 * was saved), `paid` (PayPal confirmed it) or `problem`. Returns the messages
 * that have somewhere to go: an owner email needs Settings › Order
 * notifications to (or Contact email).
 */
export const composeEmails = (kind, order, settings, config, { problem = "" } = {}) => {
  const t = EMAIL_MESSAGES[settings.language] ?? en;
  const store = settings.storeName || "Shop";
  const base = { from: config.from, fromName: config.fromName || store };
  const items = { title: t.items, lines: order.lines.map((line) => lineText(line, settings)) };
  const messages = [];
  const owner = (subject, intro, sections, closing = []) => {
    if (!config.notify) return;
    messages.push({
      ...base,
      tag: `owner-${kind}`,
      to: config.notify,
      replyTo: isSafeAddress(order.email) ? order.email : "",
      subject,
      ...render({ t, settings, greeting: t.hello, intro, sections, closing }),
    });
  };
  const customer = {
    title: t.customer,
    lines: [
      [t.order_id, order.orderId],
      [t.customer, order.name],
      [t.email, order.email],
      ...(order.phone ? [[t.phone, order.phone]] : []),
      ...(order.note ? [[t.note, order.note]] : []),
    ],
  };
  const shipTo = { title: t.ship_to, lines: addressLines(order) };

  if (kind === "request") {
    const total = money(order.total, settings);
    messages.push({
      ...base,
      tag: "request-received",
      to: order.email,
      replyTo: settings.contactEmail,
      subject: fill(t.request_subject, { orderId: order.orderId }),
      ...render({
        t,
        settings,
        greeting: t.hello,
        intro: [fill(t.request_intro, { store })],
        sections: [items, { title: t.order_id, lines: [[t.order_id, order.orderId], ...totals(order, settings, t)] }],
        closing: [],
      }),
    });
    owner(fill(t.owner_request_subject, { orderId: order.orderId, total }), [t.owner_request_intro], [
      customer,
      items,
      { title: t.total, lines: totals(order, settings, t) },
      shipTo,
    ]);
  } else if (kind === "paid") {
    const amount = money(Number.isFinite(order.amountPaid) ? order.amountPaid : order.total, settings);
    const paidRows = [...totals(order, settings, t, { paid: true }), ...(order.captureId ? [[t.paypal_id, order.captureId]] : [])];
    messages.push({
      ...base,
      tag: "payment-receipt",
      to: order.email,
      replyTo: settings.contactEmail,
      subject: fill(t.receipt_subject, { orderId: order.orderId }),
      ...render({
        t,
        settings,
        greeting: order.name ? fill(t.hello_name, { name: order.name }) : t.hello,
        intro: [fill(t.receipt_intro, { store, amount })],
        sections: [
          items,
          { title: t.order_id, lines: [[t.order_id, order.orderId], ...paidRows] },
          shipTo,
          ...(order.deliveryEstimate ? [{ title: t.delivery, lines: [order.deliveryEstimate] }] : []),
        ],
        closing: [t.receipt_next],
      }),
    });
    owner(fill(t.owner_paid_subject, { orderId: order.orderId, amount }), [t.owner_paid_intro], [
      customer,
      items,
      { title: t.total_paid, lines: paidRows },
      shipTo,
    ]);
  } else if (kind === "problem") {
    owner(fill(t.owner_problem_subject, { orderId: order.orderId }), [t.owner_problem_intro, problem], [customer, { title: t.total, lines: totals(order, settings, t) }], [
      t.owner_problem_next,
    ]);
  }
  return messages.filter((message) => isSafeAddress(message.to));
};

/** One Orders `email-log` line per message: what was sent, to whom, or why not. */
export const emailLogLines = (results, nowIso) =>
  results.map((result) =>
    result.ok ? `${nowIso} sent ${result.tag} to ${result.to}` : `${nowIso} FAILED ${result.tag} to ${result.to}: ${String(result.error).slice(0, 200)}`,
  );

/** Why nothing was sent, as an `email-log` line the owner can act on. */
export const EMAIL_SKIP_REASONS = {
  off: "no email sent: SMTP is not set up (Settings › SMTP host)",
  "no-sender": "no email sent: Settings › Send emails from is not a usable address",
  "no-password": "no email sent: the SMTP password (BUSA_SHOP_SMTP_PASSWORD) is not in the Space Vault, marked Runtime",
  "bad-port": "no email sent: Settings › SMTP port must be 587 (STARTTLS) or 465 (TLS); port 25 is blocked for websites",
  "browser-engine": "no email sent: the private browser preview cannot send email",
};
