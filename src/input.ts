export const mouse = { x: 0, y: 0, down: 0, type: 1 };

export const keys: Record<string, boolean> = {};

const githubBtn = document.getElementById('githubBtn') as HTMLAnchorElement;
githubBtn.onmousedown = (event) => {
  event.stopPropagation();
};

let pan = false;

window.addEventListener('mousedown', (event) => {
  const a = window.innerWidth / window.innerHeight;
  mouse.x = (event.clientX / window.innerWidth - 0.5) * 2 * a;
  mouse.y = -(event.clientY / window.innerHeight - 0.5) * 2;

  mouse.x /= tcamera.zoom;
  mouse.y /= tcamera.zoom;

  mouse.x += tcamera.x;
  mouse.y += tcamera.y;
  if (event.button == 0) mouse.down = keys.ShiftLeft ? 2 : 1;
  if (event.button == 2) pan = true;
  // if (event.button == 2) mouse.down = 2;
});

window.addEventListener('mouseup', (event) => {
  const a = window.innerWidth / window.innerHeight;
  mouse.x = (event.clientX / window.innerWidth - 0.5) * 2 * a;
  mouse.y = -(event.clientY / window.innerHeight - 0.5) * 2;
  mouse.down = 0;
  pan = false;

  mouse.x /= tcamera.zoom;
  mouse.y /= tcamera.zoom;

  mouse.x += tcamera.x;
  mouse.y += tcamera.y;
});

window.addEventListener('mousemove', (event) => {
  const a = window.innerWidth / window.innerHeight;
  mouse.x = (event.clientX / window.innerWidth - 0.5) * 2 * a;
  mouse.y = -(event.clientY / window.innerHeight - 0.5) * 2;

  mouse.x /= tcamera.zoom;
  mouse.y /= tcamera.zoom;

  mouse.x += tcamera.x;
  mouse.y += tcamera.y;

  if (pan) {
    tcamera.x -= event.movementX / 500 / tcamera.zoom;
    tcamera.y += event.movementY / 500 / tcamera.zoom;
  }
});

window.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

window.addEventListener('keydown', (event) => {
  if (event.code.includes('Digit')) {
    const type = parseInt(event.code[5]);
    if (type < 4) mouse.type = type;
  }
});

// window.addEventListener('touchstart', (event) => {

// })

export const tcamera = { x: 0, y: 0, zoom: 1 };

window.addEventListener(
  'wheel',
  (event) => {
    if (event.ctrlKey) {
      const a = window.innerWidth / window.innerHeight;
      tcamera.zoom *= 1 - event.deltaY / 100;
      tcamera.x +=
        (((event.clientX / window.innerWidth - 0.5) * -2) / tcamera.zoom) *
        (event.deltaY / 100) *
        a;

      tcamera.y +=
        (((event.clientY / window.innerHeight - 0.5) * 2) / tcamera.zoom) *
        (event.deltaY / 100);
    } else {
      tcamera.x += event.deltaX / 500 / tcamera.zoom;
      tcamera.y -= event.deltaY / 500 / tcamera.zoom;
    }
    event.preventDefault();
  },
  { passive: false },
);

window.addEventListener('keydown', (event) => {
  keys[event.code] = true;
});

window.addEventListener('keyup', (event) => {
  delete keys[event.code];
});
