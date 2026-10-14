/* @ds-bundle: {"format":4,"namespace":"DaFit","components":[{"name":"Button"},{"name":"IconButton"},{"name":"TextField"},{"name":"SegmentedControl"},{"name":"Switch"},{"name":"Chip"},{"name":"Badge"},{"name":"TierLock"},{"name":"DaRing"},{"name":"StatTile"},{"name":"PassCard"},{"name":"ListGroup"},{"name":"ListRow"},{"name":"SessionRow"},{"name":"Avatar"},{"name":"LargeTitle"},{"name":"TabBar"},{"name":"Sheet"},{"name":"Toast"},{"name":"EmptyState"},{"name":"Skeleton"},{"name":"Icon"}]} */
(function () {
  "use strict";
  var React = window.React;
  var h = React.createElement;
  var useState = React.useState, useEffect = React.useEffect, useRef = React.useRef;

  function cx() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) { if (arguments[i]) out.push(arguments[i]); }
    return out.join(" ");
  }
  function omit(obj, keys) {
    var r = {};
    for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k) && keys.indexOf(k) < 0) r[k] = obj[k]; }
    return r;
  }

  /* Lucide icons (ISC license, lucide.dev) — the same set the app uses via lucide-react. */
  var ICONS = {"house":[["path",{"d":"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"}],["path",{"d":"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"}]],"calendar":[["path",{"d":"M8 2v3"}],["path",{"d":"M16 2v3"}],["rect",{"x":"3","y":"3","width":"18","height":"18","rx":"2"}],["path",{"d":"M3 9h18"}]],"calendar-days":[["path",{"d":"M8 2v3"}],["path",{"d":"M16 2v3"}],["rect",{"x":"3","y":"3","width":"18","height":"18","rx":"2"}],["path",{"d":"M3 9h18"}],["path",{"d":"M8 13h.01"}],["path",{"d":"M12 13h.01"}],["path",{"d":"M16 13h.01"}],["path",{"d":"M8 17h.01"}],["path",{"d":"M12 17h.01"}],["path",{"d":"M16 17h.01"}]],"calendar-plus":[["path",{"d":"M16 18h6"}],["path",{"d":"M16 2v3"}],["path",{"d":"M19 15v6"}],["path",{"d":"M21 11.5V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h8.3"}],["path",{"d":"M3 9h18"}],["path",{"d":"M8 2v3"}]],"users":[["path",{"d":"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"}],["path",{"d":"M16 3.128a4 4 0 0 1 0 7.744"}],["path",{"d":"M22 21v-2a4 4 0 0 0-3-3.87"}],["circle",{"cx":"9","cy":"7","r":"4"}]],"wallet":[["path",{"d":"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"}],["path",{"d":"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"}]],"dumbbell":[["path",{"d":"M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z"}],["path",{"d":"m2.5 21.5 1.4-1.4"}],["path",{"d":"m20.1 3.9 1.4-1.4"}],["path",{"d":"M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z"}],["path",{"d":"m9.6 14.4 4.8-4.8"}]],"chart-line":[["path",{"d":"M3 3v16a2 2 0 0 0 2 2h16"}],["path",{"d":"m19 9-5 5-4-4-3 3"}]],"chart-column":[["path",{"d":"M3 3v16a2 2 0 0 0 2 2h16"}],["path",{"d":"M18 17V9"}],["path",{"d":"M13 17V5"}],["path",{"d":"M8 17v-3"}]],"user":[["path",{"d":"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"}],["circle",{"cx":"12","cy":"7","r":"4"}]],"plus":[["path",{"d":"M5 12h14"}],["path",{"d":"M12 5v14"}]],"chevron-right":[["path",{"d":"m9 18 6-6-6-6"}]],"chevron-left":[["path",{"d":"m15 18-6-6 6-6"}]],"lock":[["rect",{"width":"18","height":"11","x":"3","y":"11","rx":"2","ry":"2"}],["path",{"d":"M7 11V7a5 5 0 0 1 10 0v4"}]],"check":[["path",{"d":"M20 6 9 17l-5-5"}]],"x":[["path",{"d":"M18 6 6 18"}],["path",{"d":"m6 6 12 12"}]],"bell":[["path",{"d":"M10.268 21a2 2 0 0 0 3.464 0"}],["path",{"d":"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"}]],"ellipsis":[["circle",{"cx":"12","cy":"12","r":"1"}],["circle",{"cx":"19","cy":"12","r":"1"}],["circle",{"cx":"5","cy":"12","r":"1"}]],"settings":[["path",{"d":"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"}],["circle",{"cx":"12","cy":"12","r":"3"}]],"activity":[["path",{"d":"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"}]],"ruler":[["path",{"d":"M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"}],["path",{"d":"m14.5 12.5 2-2"}],["path",{"d":"m11.5 9.5 2-2"}],["path",{"d":"m8.5 6.5 2-2"}],["path",{"d":"m17.5 15.5 2-2"}]],"camera":[["path",{"d":"M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"}],["circle",{"cx":"12","cy":"13","r":"3"}]],"message-circle":[["path",{"d":"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"}]],"clock":[["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"M12 6v6l4 2"}]],"map-pin":[["path",{"d":"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"}],["circle",{"cx":"12","cy":"10","r":"3"}]],"video":[["path",{"d":"m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"}],["rect",{"x":"2","y":"6","width":"14","height":"12","rx":"2"}]],"flame":[["path",{"d":"M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"}]],"sparkles":[["path",{"d":"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"}],["path",{"d":"M20 2v4"}],["path",{"d":"M22 4h-4"}],["circle",{"cx":"4","cy":"20","r":"2"}]],"trophy":[["path",{"d":"M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2"}],["path",{"d":"M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2"}],["path",{"d":"M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3"}],["path",{"d":"M4 22h16"}],["path",{"d":"M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"}],["path",{"d":"M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"}]],"qr-code":[["rect",{"width":"5","height":"5","x":"3","y":"3","rx":"1"}],["rect",{"width":"5","height":"5","x":"16","y":"3","rx":"1"}],["rect",{"width":"5","height":"5","x":"3","y":"16","rx":"1"}],["path",{"d":"M21 16h-3a2 2 0 0 0-2 2v3"}],["path",{"d":"M21 21v.01"}],["path",{"d":"M12 7v3a2 2 0 0 1-2 2H7"}],["path",{"d":"M3 12h.01"}],["path",{"d":"M12 3h.01"}],["path",{"d":"M12 16v.01"}],["path",{"d":"M16 12h1"}],["path",{"d":"M21 12v.01"}],["path",{"d":"M12 21v-1"}]],"search":[["path",{"d":"m21 21-4.34-4.34"}],["circle",{"cx":"11","cy":"11","r":"8"}]],"sliders-horizontal":[["path",{"d":"M10 5H3"}],["path",{"d":"M12 19H3"}],["path",{"d":"M14 3v4"}],["path",{"d":"M16 17v4"}],["path",{"d":"M21 12h-9"}],["path",{"d":"M21 19h-5"}],["path",{"d":"M21 5h-7"}],["path",{"d":"M8 10v4"}],["path",{"d":"M8 12H3"}]],"circle-alert":[["circle",{"cx":"12","cy":"12","r":"10"}],["line",{"x1":"12","x2":"12","y1":"8","y2":"12"}],["line",{"x1":"12","x2":"12.01","y1":"16","y2":"16"}]],"info":[["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"M12 16v-4"}],["path",{"d":"M12 8h.01"}]],"trending-up":[["path",{"d":"M16 7h6v6"}],["path",{"d":"m22 7-8.5 8.5-5-5L2 17"}]],"footprints":[["path",{"d":"M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"}],["path",{"d":"M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"}],["path",{"d":"M16 17h4"}],["path",{"d":"M4 13h4"}]],"droplet":[["path",{"d":"M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"}]],"moon":[["path",{"d":"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"}]],"utensils":[["path",{"d":"M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"}],["path",{"d":"M7 2v20"}],["path",{"d":"M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"}]]};

  function Icon(p) {
    var size = p.size || 24;
    var node = ICONS[p.name] || [];
    return h("svg", {
      width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
      strokeWidth: p.strokeWidth || 1.75, strokeLinecap: "round", strokeLinejoin: "round",
      "aria-hidden": p.label ? undefined : true, role: p.label ? "img" : undefined, "aria-label": p.label, className: p.className
    }, node.map(function (n, i) { return h(n[0], Object.assign({ key: i }, n[1])); }));
  }

  function Button(p) {
    var variant = p.variant || "primary", size = p.size || "md";
    var rest = omit(p, ["variant", "size", "block", "loading", "icon", "children", "className"]);
    return h("button", Object.assign({ type: "button" }, rest, {
      className: cx("df-btn", "df-btn-" + variant, size !== "md" && "df-btn-" + size, p.block && "df-btn-block", p.className),
      disabled: p.disabled || p.loading, "aria-busy": p.loading || undefined
    }),
      p.loading ? h("span", { className: "df-spinner", "aria-hidden": true }) : (p.icon ? h(Icon, { name: p.icon, size: 20, strokeWidth: 2 }) : null),
      p.children);
  }

  function IconButton(p) {
    var rest = omit(p, ["icon", "label", "variant", "className"]);
    return h("button", Object.assign({ type: "button" }, rest, {
      className: cx("df-iconbtn", p.variant === "secondary" && "df-iconbtn-secondary", p.className), "aria-label": p.label
    }), h(Icon, { name: p.icon, size: 24 }));
  }

  var fieldSeq = 0;
  function TextField(p) {
    var idRef = useRef(null);
    if (!idRef.current) { fieldSeq += 1; idRef.current = "df-field-" + fieldSeq; }
    var id = p.id || idRef.current;
    var rest = omit(p, ["label", "hint", "error", "suffix", "className", "id"]);
    return h("div", { className: cx("df-field", p.error && "df-field-error", p.className) },
      p.label ? h("label", { className: "df-field-label", htmlFor: id }, p.label) : null,
      h("div", { className: "df-field-box" },
        h("input", Object.assign({}, rest, { id: id, "aria-invalid": p.error ? true : undefined, "aria-describedby": (p.error || p.hint) ? id + "-hint" : undefined })),
        p.suffix ? h("span", { className: "df-field-suffix" }, p.suffix) : null),
      (p.error || p.hint) ? h("div", { className: "df-field-hint", id: id + "-hint" }, p.error || p.hint) : null);
  }

  function SegmentedControl(p) {
    var opts = p.options || [];
    var st = useState(p.defaultValue != null ? p.defaultValue : (opts[0] && opts[0].value));
    var value = p.value != null ? p.value : st[0];
    var idx = Math.max(0, opts.findIndex(function (o) { return o.value === value; }));
    function pick(v) { if (p.value == null) st[1](v); if (p.onChange) p.onChange(v); }
    return h("div", { className: cx("df-seg", p.className), role: "group", "aria-label": p.label },
      h("span", { className: "df-seg-thumb", "aria-hidden": true, style: { width: "calc((100% - 6px) / " + opts.length + ")", transform: "translateX(" + (idx * 100) + "%)" } }),
      opts.map(function (o) {
        return h("button", { key: o.value, type: "button", className: "df-seg-item", "aria-pressed": o.value === value, onClick: function () { pick(o.value); } }, o.label);
      }));
  }

  function Switch(p) {
    var st = useState(!!p.defaultChecked);
    var on = p.checked != null ? p.checked : st[0];
    function toggle() { var v = !on; if (p.checked == null) st[1](v); if (p.onChange) p.onChange(v); }
    var sw = h("button", { type: "button", role: "switch", "aria-checked": on, "aria-label": p.label && !p.showLabel ? p.label : undefined, className: "df-switch", onClick: toggle, disabled: p.disabled });
    if (!p.showLabel) return sw;
    return h("label", { className: "df-switch-row" }, h("span", null, p.label), sw);
  }

  function Chip(p) {
    var rest = omit(p, ["selected", "icon", "children", "className"]);
    return h("button", Object.assign({ type: "button" }, rest, { className: cx("df-chip", p.className), "aria-pressed": !!p.selected }),
      p.selected ? h(Icon, { name: "check", size: 16, strokeWidth: 2.25 }) : (p.icon ? h(Icon, { name: p.icon, size: 16 }) : null),
      p.children);
  }

  function Badge(p) {
    var tone = p.tone || "neutral";
    var icon = p.icon || (tone === "pro" || tone === "premium" ? null : null);
    return h("span", { className: cx("df-badge", tone !== "neutral" && "df-badge-" + tone, p.className) },
      icon ? h(Icon, { name: icon, size: 14, strokeWidth: 2 }) : null,
      p.children || (tone === "pro" ? "Pro" : tone === "premium" ? "Premium" : null));
  }

  function TierLock(p) {
    var tier = p.tier || "pro";
    return h("div", { className: cx("df-lock", p.className) },
      h("div", { className: "df-lock-icon" }, h(Icon, { name: "lock", size: 20 })),
      h("div", { className: "df-lock-body" },
        h("div", { className: "df-lock-title" }, p.title, h(Badge, { tone: tier })),
        p.description ? h("div", { className: "df-lock-text" }, p.description) : null,
        h("div", null, h(Button, { variant: "secondary", size: "sm", onClick: p.onRequest, disabled: p.requested }, p.requested ? "Запрос отправлен" : (p.actionLabel || "Запросить доступ")))));
  }

  /* The signature: a progress ring that, when the session is done, closes and lets the check break out. */
  var MARK_ARC = "M38.72 15.5A17 17 0 1 1 28.4 7.58";
  var MARK_CHECK = "M15.5 25L22 31.5L35.5 11";
  function DaRing(p) {
    var size = p.size || 28, state = p.state || "scheduled";
    var prev = useRef(state);
    var an = useState(!!p.animate);
    useEffect(function () {
      if (prev.current !== "done" && state === "done") an[1](true);
      prev.current = state;
    }, [state]);
    var stroke = size >= 64 ? 4 : 5;
    var labels = { scheduled: "Запланировано", progress: "В процессе", done: "Проведено", missed: "Неявка", cancelled: "Отменено" };
    var label = p.label || labels[state];
    var body;
    if (state === "done") {
      body = [
        h("path", { key: "a", className: "df-ring-arc df-ring-done", d: MARK_ARC, pathLength: 100, fill: "none", strokeWidth: stroke, strokeLinecap: "round" }),
        h("path", { key: "c", className: "df-ring-check df-ring-done", d: MARK_CHECK, pathLength: 100, fill: "none", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round" })
      ];
    } else if (state === "missed") {
      body = [
        h("circle", { key: "t", cx: 24, cy: 24, r: 17, fill: "none", className: "df-ring-missed", strokeWidth: stroke }),
        h("path", { key: "x", d: "M18 18L30 30M30 18L18 30", fill: "none", className: "df-ring-missed", strokeWidth: stroke, strokeLinecap: "round" })
      ];
    } else if (state === "cancelled") {
      body = [h("circle", { key: "t", cx: 24, cy: 24, r: 17, fill: "none", className: "df-ring-cancelled", strokeWidth: stroke, strokeDasharray: "2 6", strokeLinecap: "round" })];
    } else {
      var v = state === "progress" ? Math.max(0, Math.min(1, p.value || 0)) : 0;
      body = [
        h("circle", { key: "t", cx: 24, cy: 24, r: 17, fill: "none", className: state === "scheduled" ? "df-ring-scheduled" : "df-ring-track", strokeWidth: state === "scheduled" ? Math.max(2, stroke - 2) : stroke }),
        v > 0 ? h("circle", { key: "p", cx: 24, cy: 24, r: 17, fill: "none", className: "df-ring-progress", strokeWidth: stroke, strokeLinecap: "round", pathLength: 100, strokeDasharray: (v * 100) + " 100", transform: "rotate(-90 24 24)" }) : null
      ];
    }
    return h("span", { className: cx("df-ring", an[0] && state === "done" && "df-ring-animate", p.className), role: "img", "aria-label": label, onAnimationEnd: function (e) { if (e.animationName === "df-pop") an[1](false); } },
      h("svg", { width: size, height: size, viewBox: "0 0 48 48" }, body));
  }

  function StatTile(p) {
    var dir = p.delta == null ? null : (p.deltaDirection || (String(p.delta).trim().charAt(0) === "−" || String(p.delta).trim().charAt(0) === "-" ? "down" : "up"));
    var tone = p.deltaTone || dir;
    return h("div", { className: cx("df-stat", p.className) },
      h("div", { className: "df-stat-label" }, p.label),
      h("div", { className: "df-stat-value" }, h("span", { className: "df-num" }, p.value), p.unit ? h("span", { className: "df-stat-unit" }, p.unit) : null),
      p.delta != null ? h("div", { className: cx("df-stat-delta", "df-stat-delta-" + (tone === "flat" ? "flat" : tone === "down" ? "down" : "up")) },
        h(Icon, { name: "trending-up", size: 16, strokeWidth: 2, className: dir === "down" ? "df-flip" : null }),
        p.delta, p.caption ? h("span", null, " " + p.caption) : null) : (p.caption ? h("div", { className: "df-stat-label" }, p.caption) : null));
  }

  function PassCard(p) {
    var total = p.total || 0, left = Math.max(0, p.left || 0), debt = Math.max(0, p.debt || 0);
    var plates = [];
    if (total > 0 && total <= 20) {
      for (var i = 0; i < total; i++) plates.push(h("i", { key: i, className: cx("df-pass-plate", i < left && "df-pass-plate-left") }));
      for (var j = 0; j < debt && j < 6; j++) plates.push(h("i", { key: "d" + j, className: "df-pass-plate df-pass-plate-debt" }));
    }
    var bar = total > 20
      ? h("div", { className: "df-pass-meter", role: "presentation" }, h("i", { style: { width: Math.round(left / total * 100) + "%" } }))
      : h("div", { className: "df-pass-bar", "aria-hidden": true }, plates);
    return h("div", { className: cx("df-pass", p.className), role: "group", "aria-label": p.title },
      h("div", { className: "df-pass-head" },
        h("div", null, h("div", { className: "df-pass-title" }, p.title), p.subtitle ? h("div", { className: "df-pass-sub" }, p.subtitle) : null),
        debt > 0 ? h(Badge, { tone: "danger", icon: "circle-alert" }, "Долг: " + debt) : (p.status ? h(Badge, { tone: p.statusTone || "neutral" }, p.status) : null)),
      h("div", { className: "df-pass-count" }, h("span", { className: "df-num" }, debt > 0 ? "0" : String(left)), h("span", { className: "df-pass-count-of" }, "из " + total + " занятий")),
      bar,
      h("div", { className: "df-pass-foot" }, h("span", null, p.expires || ""), h("span", { className: "df-tnum" }, p.price || "")));
  }

  function ListGroup(p) {
    return h("section", { className: cx("df-group", p.className) },
      p.header ? h("div", { className: "df-group-header" }, p.header) : null,
      h("div", { className: "df-group-body" }, p.children),
      p.footer ? h("div", { className: "df-group-footer" }, p.footer) : null);
  }

  function ListRow(p) {
    var inner = [
      p.icon ? h("span", { key: "i", className: cx("df-listrow-icon", p.iconTone === "accent" && "df-listrow-icon-accent") }, h(Icon, { name: p.icon, size: 18, strokeWidth: 2 })) : null,
      p.avatar ? h(Avatar, { key: "a", name: p.avatar, src: p.avatarSrc, size: 40 }) : null,
      p.leading ? h(React.Fragment, { key: "l" }, p.leading) : null,
      h("span", { key: "t", className: "df-listrow-text" }, h("span", { className: "df-listrow-title" }, p.title), p.subtitle ? h("span", { className: "df-listrow-sub" }, p.subtitle) : null),
      p.value != null ? h("span", { key: "v", className: "df-listrow-value df-tnum" }, p.value) : null,
      p.badge ? h(Badge, { key: "b", tone: p.badgeTone || "neutral", icon: p.badgeIcon }, p.badge) : null,
      p.trailing ? h(React.Fragment, { key: "r" }, p.trailing) : null,
      p.onClick || p.href ? h("span", { key: "c", className: "df-chevron" }, h(Icon, { name: "chevron-right", size: 20 })) : null
    ];
    var style = p.avatar ? { "--df-inset": "68px" } : (p.icon || p.leading ? { "--df-inset": "58px" } : null);
    if (p.href) return h("a", { className: "df-listrow df-row-btn", href: p.href, style: style }, inner);
    if (p.onClick) return h("button", { type: "button", className: "df-listrow df-row-btn", onClick: p.onClick, style: style }, inner);
    return h("div", { className: "df-listrow", style: style }, inner);
  }

  function SessionRow(p) {
    var state = p.state || "scheduled";
    return h("div", { className: cx("df-session", state === "cancelled" && "df-session-cancelled", p.onClick && "df-row-btn"), onClick: p.onClick, role: p.onClick ? "button" : undefined, tabIndex: p.onClick ? 0 : undefined },
      h("div", { className: "df-session-time df-tnum" }, h("b", null, p.time), p.duration ? h("small", null, p.duration) : null),
      h("div", { className: "df-session-text" },
        h("div", { className: "df-session-title" }, p.title),
        h("div", { className: "df-session-sub" }, p.format === "online" ? h(Icon, { name: "video", size: 16 }) : (p.format === "offline" ? h(Icon, { name: "map-pin", size: 16 }) : null), p.subtitle)),
      h(DaRing, { state: state, value: p.value, size: 28 }));
  }

  function Avatar(p) {
    var size = p.size || 40;
    var initials = (p.name || "").split(" ").filter(Boolean).slice(0, 2).map(function (s) { return s.charAt(0).toUpperCase(); }).join("");
    return h("span", { className: cx("df-avatar", p.className), style: { width: size, height: size, fontSize: Math.round(size * 0.38) }, role: "img", "aria-label": p.name },
      p.src ? h("img", { src: p.src, alt: "" }) : initials);
  }

  function LargeTitle(p) {
    var leading = p.leading
      || (p.back ? h("button", { type: "button", className: "df-back", onClick: p.onBack }, h(Icon, { name: "chevron-left", size: 24, strokeWidth: 2 }), h("span", null, p.back)) : null)
      || (p.avatar ? h("button", { type: "button", className: "df-header-avatar", "aria-label": "Профиль", onClick: p.onAvatar }, h(Avatar, { name: p.avatar, src: p.avatarSrc, size: 32 })) : null);
    return h("header", { className: cx("df-header", p.className) },
      h("div", { className: "df-header-bar" }, h("div", { className: "df-header-side" }, leading), h("div", { className: "df-header-side" }, p.actions || p.children)),
      h("h1", { className: "df-header-title" }, p.title),
      p.subtitle ? h("div", { className: "df-header-sub" }, p.subtitle) : null);
  }

  function TabBar(p) {
    var st = useState(p.defaultValue || (p.items && p.items[0] && p.items[0].id));
    var value = p.value != null ? p.value : st[0];
    return h("nav", { className: cx("df-tabbar", p.className), "aria-label": p.label || "Разделы" },
      (p.items || []).map(function (it) {
        var active = it.id === value;
        return h("button", { key: it.id, type: "button", className: "df-tab", "aria-current": active ? "page" : undefined, onClick: function () { if (p.value == null) st[1](it.id); if (p.onChange) p.onChange(it.id); } },
          h(Icon, { name: it.icon, size: 24, strokeWidth: active ? 2.25 : 1.75 }), h("span", null, it.label));
      }));
  }

  function Sheet(p) {
    return h("div", { className: cx("df-sheet-wrap", p.className) },
      h("div", { className: "df-sheet", role: "dialog", "aria-modal": true, "aria-label": p.title },
        h("div", { className: "df-sheet-grabber", "aria-hidden": true }),
        p.title ? h("h2", { className: "df-sheet-title" }, p.title) : null,
        p.description ? h("p", { className: "df-sheet-text" }, p.description) : null,
        p.children,
        p.actions ? h("div", { className: "df-sheet-actions" }, p.actions) : null));
  }

  function Toast(p) {
    var tone = p.tone || "success";
    var icon = p.icon || (tone === "danger" ? "circle-alert" : tone === "success" ? "check" : "info");
    return h("div", { className: cx("df-toast", "df-toast-" + tone, p.className), role: "status" },
      h(Icon, { name: icon, size: 20, strokeWidth: 2 }), h("span", null, p.title),
      p.actionLabel ? h(Button, { variant: "ghost", onClick: p.onAction }, p.actionLabel) : null);
  }

  function EmptyState(p) {
    return h("div", { className: cx("df-empty", p.className) },
      h("div", { className: "df-empty-icon" }, h(Icon, { name: p.icon || "users", size: 28 })),
      h("h3", { className: "df-empty-title" }, p.title),
      p.description ? h("p", { className: "df-empty-text" }, p.description) : null,
      p.action || p.children || null);
  }

  function Skeleton(p) {
    var rows = p.rows || 3;
    var out = [];
    for (var i = 0; i < rows; i++) {
      out.push(h("div", { key: i, className: "df-skel-row" }, h("span", { className: "df-skel-dot" }),
        h("div", { style: { flex: 1, display: "flex", flexDirection: "column", gap: 8 } }, h("span", { className: "df-skel-line", style: { width: (70 - i * 12) + "%" } }), h("span", { className: "df-skel-line", style: { width: (45 + i * 8) + "%" } }))));
    }
    return h("div", { className: cx("df-skel", p.className), role: "status", "aria-busy": true, "aria-label": p.label || "Загрузка" }, out);
  }

  var api = { Button: Button, IconButton: IconButton, TextField: TextField, SegmentedControl: SegmentedControl, Switch: Switch, Chip: Chip, Badge: Badge, TierLock: TierLock, DaRing: DaRing, StatTile: StatTile, PassCard: PassCard, ListGroup: ListGroup, ListRow: ListRow, SessionRow: SessionRow, Avatar: Avatar, LargeTitle: LargeTitle, TabBar: TabBar, Sheet: Sheet, Toast: Toast, EmptyState: EmptyState, Skeleton: Skeleton, Icon: Icon, icons: Object.keys(ICONS) };
  window.DaFit = Object.assign(window.DaFit || {}, api);
})();
