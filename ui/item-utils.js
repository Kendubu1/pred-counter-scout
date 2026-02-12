// Item image utilities
(function() {
  function itemSlug(name) {
    if (!name) return '';
    return name
      .toLowerCase()
      .replace(/&/g, '-')
      .replace(/'/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // Cache of known-bad slugs to avoid repeated broken images
  const _badSlugs = new Set();

  function itemImg(name) {
    if (!name) return '';
    const slug = itemSlug(name);
    if (!slug || _badSlugs.has(slug)) return '';
    return `<img src="img/items/${slug}.webp" alt="${name.replace(/"/g, '&quot;')}" class="item-icon" title="${name.replace(/"/g, '&quot;')}" loading="lazy" onerror="this.classList.add('item-icon-missing')">`;
  }

  function itemWithImg(name) {
    if (!name) return '';
    const img = itemImg(name);
    const escaped = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return `<span class="item-with-icon" data-item-name="${escaped}" style="cursor:pointer">${img}${escaped}</span>`;
  }

  // Augment image helper
  function augmentSlug(name) {
    if (!name) return '';
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  }
  function augmentImg(name) {
    if (!name) return '';
    const slug = augmentSlug(name);
    if (!slug) return '';
    return `<img src="img/augments/${slug}.webp" alt="${name.replace(/"/g, '&quot;')}" class="augment-icon" title="${name.replace(/"/g, '&quot;')}" loading="lazy" onerror="this.style.display='none'">`;
  }
  function augmentWithImg(name) {
    if (!name) return '';
    const img = augmentImg(name);
    const escaped = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return `<span class="item-with-icon">${img}${escaped}</span>`;
  }

  // Crest image helper
  function crestSlug(name) {
    if (!name) return '';
    return name.trim().replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '').replace(/[^a-z0-9-]/g, '');
  }
  function crestImg(name) {
    if (!name) return '';
    const slug = crestSlug(name);
    if (!slug) return '';
    return `<img src="img/crests/${slug}.webp" alt="${name.replace(/"/g, '&quot;')}" class="item-icon" title="${name.replace(/"/g, '&quot;')}" loading="lazy" onerror="this.style.display='none'">`;
  }
  function crestWithImg(name) {
    if (!name) return '';
    const img = crestImg(name);
    const escaped = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return `<span class="item-with-icon">${img}${escaped}</span>`;
  }

  window.itemImg = itemImg;
  window.itemWithImg = itemWithImg;
  window.itemSlug = itemSlug;
  window.augmentImg = augmentImg;
  window.augmentWithImg = augmentWithImg;
  window.crestSlug = crestSlug;
  window.crestImg = crestImg;
  window.crestWithImg = crestWithImg;
})();
