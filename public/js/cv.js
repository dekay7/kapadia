(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const buttons = Array.from(document.querySelectorAll('[data-filter]'));
    const entries = Array.from(document.querySelectorAll('.timeline-entry'));
    const status = document.getElementById('timeline-status');
    const progress = document.querySelector('.timeline-progress');
    const timeline = document.querySelector('.timeline');

    function setFilter(category) {
      let visible = 0;
      entries.forEach((entry) => {
        const show = category === 'all' || entry.dataset.category === category;
        entry.hidden = !show;
        if (show) visible += 1;
      });
      buttons.forEach((button) => {
        const active = button.dataset.filter === category;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      if (status) status.textContent = `${visible} timeline entries shown.`;
      updateProgress();
    }

    function updateProgress() {
      if (!progress || !timeline) return;
      const rect = timeline.getBoundingClientRect();
      const visibleHeight = Math.min(Math.max(window.innerHeight * 0.65 - rect.top, 0), rect.height);
      progress.style.height = `${Math.round((visibleHeight / Math.max(rect.height, 1)) * 100)}%`;
      const dotStyle = entries.length ? getComputedStyle(entries[0], '::before') : null;
      const dotCenterOffset = dotStyle
        ? parseFloat(dotStyle.top) + (parseFloat(dotStyle.width) + 2 * parseFloat(dotStyle.borderTopWidth)) / 2
        : 0;

      entries.forEach((entry) => {
        entry.classList.toggle('is-past', !entry.hidden && entry.offsetTop + dotCenterOffset <= visibleHeight);
      });
    }

    buttons.forEach((button) => {
      button.addEventListener('click', () => setFilter(button.dataset.filter || 'all'));
    });

    document.querySelectorAll('.print-btn').forEach((button) => {
      button.addEventListener('click', () => window.print());
    });

    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
    updateProgress();
  });
}());
