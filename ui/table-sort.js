// table-sort.js — Lightweight sortable table columns
// Auto-initializes on any <th data-sortable> elements.
// Click: asc → desc → original order. Shows ▲/▼ indicator.

(function () {
  'use strict';

  var SORT_ASC = 'asc';
  var SORT_DESC = 'desc';
  var SORT_NONE = 'none';

  // Inject styles once
  var style = document.createElement('style');
  style.textContent =
    'th[data-sortable]{cursor:pointer;user-select:none;position:relative;transition:background .15s}' +
    'th[data-sortable]:hover{background:rgba(255,255,255,.06)}' +
    'th[data-sortable] .sort-arrow{margin-left:4px;font-size:0.7em;opacity:0.7}';
  document.head.appendChild(style);

  function parseValue(cell) {
    var text = cell.textContent.trim().replace(/[,%]/g, '');
    // Handle time strings like "12:34" → convert to seconds for sorting
    if (/^\d+:\d+$/.test(text)) {
      var parts = text.split(':');
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }
    var n = parseFloat(text);
    return isNaN(n) ? text.toLowerCase() : n;
  }

  function initTable(table) {
    var headers = table.querySelectorAll('th[data-sortable]');
    if (!headers.length) return;

    // Ensure proper thead/tbody structure so header never moves
    if (!table.querySelector('thead') && !table.querySelector('tbody')) {
      var headerRow = table.querySelector('tr');
      if (headerRow && headerRow.querySelector('th')) {
        var thead = document.createElement('thead');
        var tbody = document.createElement('tbody');
        thead.appendChild(headerRow);
        while (table.querySelector('tr')) {
          tbody.appendChild(table.querySelector('tr'));
        }
        table.appendChild(thead);
        table.appendChild(tbody);
      }
    }

    // Store original row order
    var originalRows = null;

    headers.forEach(function (th, colIdx) {
      // Find actual column index (account for position in row)
      var headerRow = th.parentElement;
      var allTh = headerRow.querySelectorAll('th');
      var realIdx = Array.prototype.indexOf.call(allTh, th);

      th.dataset.sortDir = SORT_NONE;

      th.addEventListener('click', function () {
        // Capture original order on first sort
        if (!originalRows) {
          var rows = getDataRows(table);
          originalRows = Array.prototype.slice.call(rows);
        }

        // Cycle: none → asc → desc → none
        var current = th.dataset.sortDir;
        var next = current === SORT_NONE ? SORT_ASC : current === SORT_ASC ? SORT_DESC : SORT_NONE;

        // Reset all headers in this table
        headers.forEach(function (h) {
          h.dataset.sortDir = SORT_NONE;
          var arrow = h.querySelector('.sort-arrow');
          if (arrow) arrow.textContent = '';
        });

        th.dataset.sortDir = next;
        var arrow = th.querySelector('.sort-arrow');
        if (!arrow) {
          arrow = document.createElement('span');
          arrow.className = 'sort-arrow';
          th.appendChild(arrow);
        }
        arrow.textContent = next === SORT_ASC ? '▲' : next === SORT_DESC ? '▼' : '';

        // Sort
        var container = getRowContainer(table);
        if (next === SORT_NONE) {
          // Restore original order
          originalRows.forEach(function (row) { container.appendChild(row); });
        } else {
          var rows = Array.prototype.slice.call(getDataRows(table));
          rows.sort(function (a, b) {
            var aVal = parseValue(a.children[realIdx]);
            var bVal = parseValue(b.children[realIdx]);
            var cmp;
            if (typeof aVal === 'number' && typeof bVal === 'number') {
              cmp = aVal - bVal;
            } else {
              cmp = String(aVal).localeCompare(String(bVal));
            }
            return next === SORT_DESC ? -cmp : cmp;
          });
          rows.forEach(function (row) { container.appendChild(row); });
        }
      });

      // Add empty arrow span
      var arrow = document.createElement('span');
      arrow.className = 'sort-arrow';
      th.appendChild(arrow);
    });
  }

  function getDataRows(table) {
    // If thead exists, data rows are in tbody
    var tbody = table.querySelector('tbody');
    if (tbody) return tbody.querySelectorAll('tr');
    // No thead/tbody — skip rows that contain <th> elements (header rows)
    var allRows = table.querySelectorAll('tr');
    return Array.prototype.filter.call(allRows, function (row) {
      return !row.querySelector('th');
    });
  }

  function getRowContainer(table) {
    return table.querySelector('tbody') || table;
  }

  // Observe DOM for dynamically created tables
  function scanAndInit() {
    document.querySelectorAll('th[data-sortable]').forEach(function (th) {
      var table = th.closest('table');
      if (table && !table.dataset.sortInit) {
        table.dataset.sortInit = '1';
        initTable(table);
      }
    });
  }

  // Initial scan
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanAndInit);
  } else {
    scanAndInit();
  }

  // MutationObserver for dynamically added tables
  var observer = new MutationObserver(function () { scanAndInit(); });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

  // Export for manual init if needed
  window.TableSort = { init: scanAndInit };
})();
