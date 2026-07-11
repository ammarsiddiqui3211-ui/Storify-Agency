document.addEventListener('DOMContentLoaded', () => {
  // Only enable custom cursor on desktop/devices with a fine pointer
  if (!window.matchMedia('(pointer: fine)').matches) {
    return;
  }

  // Create cursor elements
  const dot = document.createElement('div');
  dot.className = 'custom-cursor-dot';
  const ring = document.createElement('div');
  ring.className = 'custom-cursor-ring';

  // Hide initially
  dot.style.opacity = '0';
  ring.style.opacity = '0';
  dot.style.transition = 'opacity 0.2s ease, width 0.2s, height 0.2s, background-color 0.2s';
  ring.style.transition = 'opacity 0.2s ease, width 0.2s, height 0.2s, border-color 0.2s, background-color 0.2s';

  document.body.appendChild(dot);
  document.body.appendChild(ring);

  let mouseX = -100;
  let mouseY = -100;
  let ringX = -100;
  let ringY = -100;
  let isHovered = false;
  let isVisible = false;

  // Track mouse position
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    
    if (!isVisible) {
      dot.style.opacity = '1';
      ring.style.opacity = '1';
      isVisible = true;
    }
    
    // Position dot instantly
    dot.style.left = `${mouseX}px`;
    dot.style.top = `${mouseY}px`;
  });

  // Smooth trailing for the ring
  function tick() {
    // Easing formula: position += (target - position) * ease_factor
    const ease = 0.15;
    ringX += (mouseX - ringX) * ease;
    ringY += (mouseY - ringY) * ease;

    ring.style.left = `${ringX}px`;
    ring.style.top = `${ringY}px`;

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Hover states for interactive elements
  function addHoverListeners() {
    const interactives = document.querySelectorAll(
      'a, button, input, select, textarea, [role="button"], .hamburger, .mobile-menu-close, .interactive'
    );
    
    interactives.forEach(el => {
      // Remove existing to avoid double binding if called multiple times
      el.removeEventListener('mouseenter', onMouseEnter);
      el.removeEventListener('mouseleave', onMouseLeave);
      
      el.addEventListener('mouseenter', onMouseEnter);
      el.addEventListener('mouseleave', onMouseLeave);
    });
  }

  function onMouseEnter() {
    isHovered = true;
    dot.classList.add('hover');
    ring.classList.add('hover');
  }

  function onMouseLeave() {
    isHovered = false;
    dot.classList.remove('hover');
    ring.classList.remove('hover');
  }

  addHoverListeners();

  // Handle click states
  document.addEventListener('mousedown', () => {
    dot.style.transform = 'translate(-50%, -50%) scale(0.7)';
    ring.style.transform = 'translate(-50%, -50%) scale(0.6)';
  });

  document.addEventListener('mouseup', () => {
    dot.style.transform = '';
    ring.style.transform = '';
  });

  // Handle mouse leaving/entering the window
  document.addEventListener('mouseleave', () => {
    dot.style.opacity = '0';
    ring.style.opacity = '0';
    isVisible = false;
  });

  document.addEventListener('mouseenter', () => {
    dot.style.opacity = '1';
    ring.style.opacity = '1';
    isVisible = true;
  });

  // Observe DOM changes to attach hover listeners to dynamically added elements
  const observer = new MutationObserver(() => {
    addHoverListeners();
  });
  observer.observe(document.body, { childList: true, subtree: true });
});
