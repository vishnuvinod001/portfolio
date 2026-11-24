/* =====================================================================
   RUSH DASHBOARD : LOGIC
   Paste into the Web Page "JavaScript" field.
   The page layout is in the HTML field and the styling is in the CSS field.
   This script only fills in data: counts, table rows, theme, popup.
   Data comes from the API Server Script (API Method: rush_dashboard).

   SECTIONS
   1 Settings   2 Theme   3 Helpers   4 Data   5 Draw   6 Events   7 Remarks   8 Popups
   ===================================================================== */

(function () {

  /* ---------- 1. SETTINGS ---------------------------------------------- */

  var API_DATA = "/api/method/rush_dashboard";
  var API_REMARK = "/api/method/rush_add_discharge_remark";
  var REFRESH_MS = 30000;
  var ENABLE_REMINDER = true;    // Reminder (bell) button for rows that already have a remark

  // card key -> workflow status shown in the queue (null = everything)
  var STAGE_STATUS = {
    total: null,
    pending: "Pending Materials",
    procurement: "Pending Purchase",
    completed: "Completed",
    amended: "Amended"
  };
  var PILL_KEY = {
    "Pending Materials": "pending", "Pending Purchase": "procurement",
    "Completed": "completed", "Amended": "amended"
  };

  var state = { filter: "total", search: "", priority: false, data: null, stamp: null, shown: false };

  function $(id) { return document.getElementById(id); }
  var app = $("rd-app");


  /* ---------- 2. THEME (light / dark) ----------------------------------- */

  var ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  var ICON_BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var ICON_ALERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>';

  function get_theme() {
    var t = null;
    try { t = localStorage.getItem("rd-theme"); } catch (e) {}
    if (t === "light" || t === "dark") { return t; }
    var light = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    return light ? "light" : "dark";
  }
  function set_theme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("rd-theme", t); } catch (e) {}
    $("rd-theme").innerHTML = t === "dark" ? ICON_SUN : ICON_MOON;
  }


  /* ---------- 3. HELPERS ------------------------------------------------ */

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function csrf() { return window.csrf_token || (window.frappe && window.frappe.csrf_token) || ""; }
  function each(selector, fn) { Array.prototype.forEach.call(app.querySelectorAll(selector), fn); }

  var toast_timer = null;
  function toast(msg) {
    var t = $("rd-toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast_timer);
    toast_timer = setTimeout(function () { t.hidden = true; }, 3500);
  }
  function count_up(el, to) {
    var start = null;
    function step(ts) {
      if (start === null) { start = ts; }
      var p = Math.min((ts - start) / 700, 1);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) { requestAnimationFrame(step); }
    }
    requestAnimationFrame(step);
  }


  /* ---------- 4. DATA --------------------------------------------------- */

  function load() {
    return fetch(API_DATA, { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.message) { throw new Error("No data"); }
        state.data = j.message;
        state.stamp = new Date();
        draw();
      })
      .catch(function () {
        if (!state.data) {
          $("rd-updated").textContent = "Could not load. Please log in and refresh.";
          $("rd-body").innerHTML = '<tr><td colspan="7" class="rd-empty">Could not load the dashboard. Please log in and refresh.</td></tr>';
        }
      });
  }

  function visible_rows() {
    var q = state.data.queue || [];
    var status = STAGE_STATUS[state.filter];
    if (status) {
      q = q.filter(function (r) { return r.status === status; });
    }
    if (state.priority) {
      q = q.filter(function (r) { return !!r.nursing_remarks; });
    }
    var s = state.search.trim().toLowerCase();
    if (s) {
      q = q.filter(function (r) { return String(r.mrd_no || "").toLowerCase().indexOf(s) === 0; });
    }
    return q;
  }


  /* ---------- 5. DRAW (fills the fixed HTML) ----------------------------- */

  function html_row(r, access) {
    var urgent = !!r.nursing_remarks;
    var open = access.can_open
      ? '<a class="rd-btn primary" href="/app/rush-material-request/' + encodeURIComponent(r.name) + '">Open</a>' : "";
    var remark = "";
    if (access.can_remark) {
      if (!urgent) {
        remark = '<button type="button" class="rd-btn warn" data-remark="' + esc(r.name) + '">Remarks</button>';
      } else if (ENABLE_REMINDER) {
        remark = '<button type="button" class="rd-btn warn rd-icon" data-reminder="' + esc(r.name) + '" title="Send reminder" aria-label="Send reminder">' + ICON_BELL + '</button>';
      }
    }
    return '<tr class="' + (urgent ? "urgent" : "") + '">' +
      '<td><span class="rd-mrd">' + esc(r.mrd_no) + '</span>' +
        (urgent ? '<span class="rd-badge ur">URGENT</span>' : "") +
        (r.is_amended ? '<span class="rd-badge am">AMENDED</span>' : "") + '</td>' +
      '<td>' + esc(r.patient) + '</td><td>' + esc(r.department) + '</td><td>' + esc(r.doctor) + '</td>' +
      '<td><span class="rd-pill" data-s="' + (PILL_KEY[r.status] || "unclear") + '">' + esc(r.status) + '</span></td>' +
      '<td>' + esc(r.action_required) +
        (urgent ? '<div class="rd-sub">' + esc(String(r.nursing_remarks).split("\n").slice(0, 2).join(" · ")) + '</div>' : "") + '</td>' +
      '<td><div class="rd-actions">' + remark + open + '</div></td></tr>';
  }

  // rows and the active card: used by every filter, so nothing else is redrawn
  function update_view() {
    var access = state.data.access || {};
    var body = visible_rows().map(function (r) { return html_row(r, access); }).join("");
    $("rd-body").innerHTML = body || '<tr><td colspan="7" class="rd-empty">No requests here.</td></tr>';
    each(".rd-card", function (el) {
      el.classList.toggle("active", el.getAttribute("data-filter") === state.filter);
    });
    bind_rows();
  }

  function draw() {
    var c = state.data.cards || {};
    var counts = { total: c.total, pending: c.pending, procurement: c.procurement, completed: c.completed, amended: c.amended };

    $("rd-updated").textContent = "Live · Updated " + state.stamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    each(".rd-card", function (el) {
      var n = counts[el.getAttribute("data-filter")] || 0;
      var v = el.querySelector(".v");
      if (state.shown) { v.textContent = n; } else { count_up(v, n); }
    });

    var total = ["pending", "procurement", "completed", "amended"].reduce(function (a, k) { return a + (counts[k] || 0); }, 0) || 1;
    each(".rd-flow-bar i", function (el) {
      el.style.flexGrow = (counts[el.getAttribute("data-seg")] || 0) / total;
    });
    each(".rd-flow-legend li", function (el) {
      el.querySelector(".n").textContent = counts[el.getAttribute("data-seg")] || 0;
    });

    update_view();

    if (!state.shown) { setTimeout(function () { app.classList.remove("rd-first"); }, 900); }
    state.shown = true;
  }


  /* ---------- 6. EVENTS -------------------------------------------------- */

  each(".rd-card", function (el) {
    el.onclick = function () { state.filter = el.getAttribute("data-filter"); update_view(); };
  });

  $("rd-search").oninput = function () { state.search = this.value; update_view(); };
  $("rd-priority").onchange = function () { state.priority = this.checked; update_view(); };
  $("rd-clear").onclick = function () {
    state.search = ""; state.filter = "total"; state.priority = false;
    $("rd-search").value = ""; $("rd-priority").checked = false;
    update_view();
  };
  $("rd-theme").onclick = function () {
    set_theme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  };

  // row buttons are rebuilt with the rows, so they are bound after every redraw
  function bind_rows() {
    each("[data-remark]", function (el) {
      el.onclick = function () { open_remark(el.getAttribute("data-remark")); };
    });
    each("[data-reminder]", function (el) {
      el.onclick = function () { confirm_reminder(el.getAttribute("data-reminder")); };
    });
  }

  document.addEventListener("keydown", function (e) {
    var tag = (e.target.tagName || "").toLowerCase();
    if (e.key === "/" && tag !== "input" && tag !== "textarea") {   // "/" jumps to search
      e.preventDefault(); $("rd-search").focus();
    }
    if (e.key === "Escape") { close_remark(); close_dialog(); }
  });


  /* ---------- 7. REMARKS ------------------------------------------------- */

  var FIELDS = ["rd-st", "rd-sn", "rd-rm"];
  var remark_doc = null;

  function open_remark(name) {
    remark_doc = name;
    FIELDS.forEach(function (id) { $(id).value = ""; $(id).classList.remove("rd-invalid"); });
    $("rd-modal").hidden = false;
    $("rd-st").focus();
  }
  function close_remark() { $("rd-modal").hidden = true; remark_doc = null; }

  $("rd-cancel").onclick = close_remark;
  $("rd-modal").onclick = function (e) { if (e.target === this) { close_remark(); } };

  $("rd-form").onsubmit = function (e) {
    e.preventDefault();
    var bad = false;
    FIELDS.forEach(function (id) {
      var empty = !$(id).value.trim();
      $(id).classList.toggle("rd-invalid", empty);
      if (empty) { bad = true; }
    });
    if (bad) { toast("All three fields are required."); return; }
    var p = {
      docname: remark_doc,
      nursing_station: $("rd-st").value,
      nursing_staff_name: $("rd-sn").value,
      remarks: $("rd-rm").value
    };
    close_remark();
    send_remark(p);
  };

  function send_remark(p) {
    fetch(API_REMARK, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": csrf() },
      body: JSON.stringify(p)
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (x.ok) {
          var server_text = x.j.message && x.j.message.message;
          open_dialog({
            title: p.reminder ? "Reminder sent" : "Remark sent",
            text: server_text || (p.reminder ? "The reminder has been sent." : "The remark has been saved."),
            icon: ICON_CHECK
          });
          load();
        } else {
          var msg = "";
          try { msg = JSON.parse(JSON.parse(x.j._server_messages)[0]).message; } catch (e) {}
          open_dialog({ title: "Could not save", text: msg.replace(/<[^>]+>/g, "") || "Something went wrong. Please try again.", icon: ICON_ALERT, kind: "error" });
        }
      })
      .catch(function () {
        open_dialog({ title: "Could not save", text: "The server could not be reached. Please try again.", icon: ICON_ALERT, kind: "error" });
      });
  }


  /* ---------- 8. POPUPS (confirm and result) ----------------------------- */

  var dialog_on_ok = null;

  // o: { title, text, icon, kind, ok, cancel (true = show Cancel), on_ok }
  function open_dialog(o) {
    $("rd-dialog-title").textContent = o.title;
    $("rd-dialog-text").textContent = o.text;
    $("rd-dialog-icon").innerHTML = o.icon || "";
    $("rd-dialog-icon").setAttribute("data-kind", o.kind || "");
    $("rd-dialog-ok").textContent = o.ok || "OK";
    $("rd-dialog-cancel").hidden = !o.cancel;
    dialog_on_ok = o.on_ok || null;
    $("rd-dialog").hidden = false;
    $("rd-dialog-ok").focus();
  }
  function close_dialog() { $("rd-dialog").hidden = true; dialog_on_ok = null; }

  $("rd-dialog-cancel").onclick = close_dialog;
  $("rd-dialog-ok").onclick = function () { var f = dialog_on_ok; close_dialog(); if (f) { f(); } };
  $("rd-dialog").onclick = function (e) { if (e.target === this) { close_dialog(); } };

  function confirm_reminder(name) {
    var row = (state.data.queue || []).filter(function (r) { return r.name === name; })[0] || {};
    open_dialog({
      title: "Send reminder?",
      text: "A reminder will be sent again for MRD " + (row.mrd_no || name) + ".",
      icon: ICON_BELL, ok: "Send reminder", cancel: true,
      on_ok: function () { send_remark({ docname: name, reminder: 1 }); }
    });
  }


  /* ---------- START ------------------------------------------------------ */

  set_theme(get_theme());
  load();
  setInterval(load, REFRESH_MS);

})();
