// runs before first paint: apply the stored theme choice (auto = follow the OS)
try { var t = localStorage.getItem('theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) {}
