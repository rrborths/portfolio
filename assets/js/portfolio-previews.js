(() => {
  const cards = [...document.querySelectorAll(".walkthrough-preview[data-preview-src]")];
  if (!cards.length) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const saveData = navigator.connection?.saveData === true;
  const players = new Map();

  const canPreview = () => !reducedMotion.matches && !saveData && !document.hidden;
  const isEngaged = (card) => card.matches(":hover, :focus-within");

  const stop = (card) => {
    const player = players.get(card);
    if (!player) return;
    player.sequence += 1;
    player.video.pause();
    try {
      player.video.currentTime = 0;
    } catch {
      // The media element may not have loaded its metadata yet.
    }
    card.classList.remove("is-preview-playing");
  };

  const start = async (card) => {
    if (!canPreview() || !card.isConnected) return;
    let player = players.get(card);
    if (!player) {
      const video = document.createElement("video");
      video.className = "walkthrough-preview-video";
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.loop = true;
      video.preload = "none";
      video.tabIndex = -1;
      video.setAttribute("aria-hidden", "true");
      video.setAttribute("disablepictureinpicture", "");
      card.append(video);
      video.src = card.dataset.previewSrc;
      player = { video, sequence: 0 };
      players.set(card, player);
      video.load();
    }
    player.sequence += 1;
    const sequence = player.sequence;
    try {
      await player.video.play();
      if (sequence === player.sequence && isEngaged(card) && canPreview()) {
        card.classList.add("is-preview-playing");
      } else {
        stop(card);
      }
    } catch {
      stop(card);
    }
  };

  cards.forEach((card) => {
    card.addEventListener("pointerenter", () => start(card));
    card.addEventListener("pointerleave", () => {
      if (!card.matches(":focus-within")) stop(card);
    });
    card.addEventListener("focusin", () => start(card));
    card.addEventListener("focusout", () => {
      requestAnimationFrame(() => {
        if (!isEngaged(card)) stop(card);
      });
    });
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (!isIntersecting) stop(target);
    });
  });
  cards.forEach((card) => observer.observe(card));

  const stopAll = () => cards.forEach(stop);
  reducedMotion.addEventListener?.("change", stopAll);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopAll();
      return;
    }
    cards.filter(isEngaged).forEach((card) => start(card));
  });
})();
