/* Widget registry — hand-written once, parameterised by extension.params.
   A widget may hide HOW it draws. It may never hide what it assesses. */
window.__WIDGETS__ = window.__WIDGETS__ || {};

/* fit-sandbox: two sliders over a point cloud, live OLS, SSR objective. */
window.__WIDGETS__['fit-sandbox'] = function (host, ext, api) {
  var P = ext.params.points, tolF = ext.params.tolFactor || 1.35;
  var n = P.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
  P.forEach(function (p) { sx += p[0]; sy += p[1]; sxx += p[0] * p[0]; sxy += p[0] * p[1]; });
  var olsM = (n * sxy - sx * sy) / (n * sxx - sx * sx), olsB = (sy - olsM * sx) / n;
  function ssr(m, b) { var s = 0; P.forEach(function (p) { var e = p[1] - (m * p[0] + b); s += e * e; }); return s; }
  var best = ssr(olsM, olsB), bad = ssr((ext.params.badReference || {}).m || 2, (ext.params.badReference || {}).b || 5);
  var m = (ext.params.badReference || {}).m || 2, b = (ext.params.badReference || {}).b || 5, solved = false;

  host.innerHTML =
    '<div class="scroll"><svg viewBox="0 0 520 320" width="100%" height="280" role="img" aria-label="Scatter plot with an adjustable line">' +
    '<g id="pts"></g><line id="ln" stroke="var(--accent)" stroke-width="2"/></svg></div>' +
    '<label class="blank"><span>Slope</span><input id="ws" type="range" min="0" max="20" step="0.1"></label>' +
    '<label class="blank"><span>Intercept</span><input id="wb" type="range" min="-20" max="40" step="0.5"></label>' +
    '<p class="caption" id="wout" role="status"></p>';
  var svg = host.querySelector('svg'), pts = host.querySelector('#pts'), ln = host.querySelector('#ln');
  var xs = P.map(function (p) { return p[0]; }), ys = P.map(function (p) { return p[1]; });
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  var y0 = 0, y1 = Math.max.apply(null, ys) * 1.15;
  var X = function (v) { return 40 + (v - x0) / (x1 - x0) * 450; };
  var Y = function (v) { return 290 - (v - y0) / (y1 - y0) * 260; };
  pts.innerHTML = P.map(function (p) { return '<circle cx="' + X(p[0]) + '" cy="' + Y(p[1]) + '" r="5" fill="var(--observed)"/>'; }).join('');
  var sEl = host.querySelector('#ws'), bEl = host.querySelector('#wb'), out = host.querySelector('#wout');
  sEl.value = m; bEl.value = b;
  function draw() {
    m = Number(sEl.value); b = Number(bEl.value);
    ln.setAttribute('x1', X(x0)); ln.setAttribute('y1', Y(m * x0 + b));
    ln.setAttribute('x2', X(x1)); ln.setAttribute('y2', Y(m * x1 + b));
    var cur = ssr(m, b);
    out.textContent = 'Sum of squared errors: ' + cur.toFixed(1) +
      '   (best possible ' + best.toFixed(1) + ', a poor fit is ' + bad.toFixed(1) + ')';
    if (!solved && cur <= best * tolF) {
      solved = true;
      api.announce('Within ' + Math.round((tolF - 1) * 100) + '% of the least-squares minimum.');
      api.done(true);
    }
  }
  sEl.oninput = draw; bEl.oninput = draw; draw();

  // Agent 6's headless playtest needs to reach the success criterion without a
  // mouse. The widget declares how, because only the widget knows.
  host.__probeSolve = function () {
    sEl.value = String(Math.round(olsM * 10) / 10);
    bEl.value = String(Math.round(olsB * 2) / 2);
    draw();
    return solved;
  };
};
