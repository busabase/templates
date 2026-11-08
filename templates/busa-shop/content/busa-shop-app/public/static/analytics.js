// Google Analytics 4 (gtag.js) for the public site. The page names the
// measurement ID in <meta name="busa-shop-ga4"> only when Settings › Google
// Analytics 4 measurement ID is filled in, and never in the owner's previews
// (src/handler.js), so this file does nothing anywhere else.
const id = document.querySelector('meta[name="busa-shop-ga4"]')?.getAttribute("content") ?? "";
if (/^G-[A-Z0-9]{4,20}$/.test(id)) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag.js reads the arguments object itself, as Google's snippet does.
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", id);
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(script);
}
