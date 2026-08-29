// Vercel Web Analytics
// Documentation: https://vercel.com/docs/analytics/quickstart
(function () {
  // Initialize the queue-based API for Vercel Analytics
  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };
  
  // Inject the Vercel Analytics script from CDN
  var script = document.createElement("script");
  script.defer = true;
  script.src = "https://cdn.vercel-insights.com/v1/script.js";
  document.head.appendChild(script);
})();
