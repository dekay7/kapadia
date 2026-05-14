/**
 * CV.JS — Interactive functionality for the cv page
 */

document.addEventListener('DOMContentLoaded', () => {
  // Handle print buttons
  const printButtons = document.querySelectorAll('.print-btn');
  printButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      window.print();
    });
  });
});
