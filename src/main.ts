// import { GUI } from 'dat.gui';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;

const timesDisplay = document.getElementById('times') as HTMLHeadingElement;

import { tcamera, mouse } from './input';
import renderShaders from './render.wgsl?raw';
import {
  hslToRgb,
  lerp5,
  linkRenderTimestamp,
  readTimestamp,
  requestTimestamps,
  resolveTimestamp,
  setupTimestamp,
} from './utils';

const uniformsSize = 8;
const uniformData = new Float32Array(uniformsSize);

const simSize = 8;
const simData = new Float32Array(simSize);

const dt = 0.02;
const rMax = 0.4 / 4;
const forceFactor = 1 * 4;
const beta = 0.2;
const frictionHalfLife = 0.04;

const times: Record<string, Record<string, string>> = {
  nSquared: {
    'gpu time': '',
  },
  linkedList: {
    'construct time': '',
    'sim time': '',
  },
  countingSort: {
    'cell time': '',
    'prefix time': '',
    'sort time': '',
    'sim time': '',
  },
  general: {
    'cpu time': '',
    'render time': '',
  },
};

function makeRandomMatrix() {
  const rows = [];
  for (let i = 0; i < colourAmt; i++) {
    const row = [];
    for (let j = 0; j < colourAmt; j++) {
      row.push(Math.random() * 2 - 1);
    }
    rows.push(row);
  }
  return rows;
}

const colourAmt = 100;
const colours: [number, number, number][] = [];
for (let i = 0; i < colourAmt; i++) {
  colours.push(hslToRgb((i / colourAmt) * 360, 1, 0.5));
}
let matrix = makeRandomMatrix();

const particleStride = 24;

const multistep = 1;

const cellAmt = 2000;

const camera = { ...tcamera };
const cameraData = new Float32Array([camera.x, camera.y, camera.zoom]);

let particleAmt = 10000;

let device: GPUDevice | undefined;
let context: GPUCanvasContext | undefined;
let uniformBuffer: GPUBuffer | undefined;
let simBuffer: GPUBuffer | undefined;
let renderPipeline: GPURenderPipeline | undefined;
let cameraBuffer: GPUBuffer | undefined;

let matrixBuffer: GPUBuffer | undefined;
let colourBuffer: GPUBuffer | undefined;

let particleBuffers: [GPUBuffer, GPUBuffer] | undefined;

let renderBindGroup: GPUBindGroup | undefined;

let alternate = 0;
let fpsc = 0;

import * as nSquared from './nSquared/main';
import * as linkedList from './linkedList/main';
import * as countingSort from './countingSort/main';

const engines: Record<
  string,
  typeof nSquared | typeof linkedList | typeof countingSort
> = {
  nSquared,
  linkedList,
  countingSort,
};

let engine: string = 'countingSort';

// const test = {
//   one: 123,
//   two: 345,
//   three: 'testing123',
// };

// const gui = new GUI();
// const cubeFolder = gui.addFolder('Cube');
// cubeFolder.add(test, 'one');
// cubeFolder.add(test, 'two');
// cubeFolder.add(test, 'three');
// cubeFolder.open();

(async () => {
  const adapter = await navigator.gpu.requestAdapter({
    featureLevel: 'compatibility',
  });

  if (!adapter) return;

  device = await requestTimestamps(adapter);
  context = canvas.getContext('webgpu') ?? undefined;

  if (!context) return;

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  context.configure({ device, format: presentationFormat });

  //

  uniformBuffer = device.createBuffer({
    size: uniformsSize * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: 'uniformBuffer',
  });

  simBuffer = device.createBuffer({
    size: simSize * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: 'simBuffer',
  });

  cameraBuffer = device.createBuffer({
    size: 4 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: 'cameraBuffer',
  });

  //

  for (const engine in engines) {
    engines[engine].setup(device);
  }

  const renderModule = device.createShaderModule({ code: renderShaders });

  renderPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: renderModule,
      entryPoint: 'vertex',
      buffers: [
        {
          arrayStride: particleStride,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x2' },
            { shaderLocation: 2, offset: 16, format: 'float32' },
          ],
        },
      ],
    },
    fragment: {
      module: renderModule,
      entryPoint: 'fragment',
      targets: [
        {
          format: presentationFormat,
        },
      ],
    },
    primitive: {
      topology: 'triangle-strip',
    },
  });

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  setupTimestamp(device, 'render');

  startParticles();
})();

function tick(commandEncoder: GPUCommandEncoder) {
  engines[engine].tick(commandEncoder, alternate, particleAmt);
  alternate = (alternate + 1) % 2;
}

function render(context: GPUCanvasContext, commandEncoder: GPUCommandEncoder) {
  if (!renderPipeline || !particleBuffers) return;

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: [0, 0, 0, 0],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };

  const passEncoder = commandEncoder.beginRenderPass(
    linkRenderTimestamp(renderPassDescriptor, 'render'),
  );
  passEncoder.setPipeline(renderPipeline);
  passEncoder.setVertexBuffer(0, particleBuffers[(alternate + 1) % 2]);
  passEncoder.setBindGroup(0, renderBindGroup);
  passEncoder.draw(6, particleAmt, 0, 0);
  passEncoder.end();

  resolveTimestamp(commandEncoder, 'render');
}

function startParticles() {
  if (
    !device ||
    !uniformBuffer ||
    !renderPipeline ||
    !simBuffer ||
    !cameraBuffer
  )
    return;

  const bufferSize = particleAmt * particleStride;
  particleBuffers = [
    device.createBuffer({
      size: bufferSize,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.VERTEX |
        GPUBufferUsage.COPY_DST,
    }),
    device.createBuffer({
      size: bufferSize,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.VERTEX |
        GPUBufferUsage.COPY_DST,
    }),
  ];

  alternate = 0;
  const data = new Float32Array(bufferSize / 4);
  let pi = 0;
  while (pi < particleAmt) {
    const spawnAmt = ((Math.random() * (particleAmt - pi)) / colourAmt) * 5;
    const c = Math.floor(Math.random() * colourAmt);

    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * 0.9;

    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    for (let i = 0; i < spawnAmt; i++) {
      data[pi * 6] = x + (Math.random() * 2 - 1) ** 3 / 10;
      data[pi * 6 + 1] = y + (Math.random() * 2 - 1) ** 3 / 10;
      data[pi * 6 + 2] = 0;
      data[pi * 6 + 3] = 0;
      data[pi * 6 + 4] = c;

      data[pi * 6 + 5] = 0;

      pi++;
    }
  }
  // for (let i = 0; i < particleAmt; i++) {
  //   data[i * 6] = Math.random() * 2 - 1;
  //   data[i * 6 + 1] = Math.random() * 2 - 1;
  //   data[i * 6 + 2] = 0;
  //   data[i * 6 + 3] = 0;
  //   data[i * 6 + 4] = Math.floor(Math.random() * colourAmt);

  //   data[i * 6 + 5] = 0;
  //   // data[i * 8 + 6] = 0;
  //   // data[i * 8 + 7] = 0;
  // }

  device.queue.writeBuffer(particleBuffers[0], 0, data.buffer);

  simData[0] = colourAmt;
  simData[1] = beta;
  simData[2] = rMax;
  simData[3] = forceFactor;
  simData[4] = Math.pow(0.5, dt / frictionHalfLife);
  simData[5] = dt;
  simData[6] = rMax * 2;
  simData[7] = cellAmt;
  device.queue.writeBuffer(simBuffer, 0, simData);

  matrixBuffer = device.createBuffer({
    size: colourAmt * colourAmt * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const matrixData = new Float32Array(colourAmt * colourAmt);
  for (let c1 = 0; c1 < colourAmt; c1++) {
    for (let c2 = 0; c2 < colourAmt; c2++) {
      matrixData[c1 * colourAmt + c2] = matrix[c1][c2];
    }
  }
  device.queue.writeBuffer(matrixBuffer, 0, matrixData.buffer);

  colourBuffer = device.createBuffer({
    size: colourAmt * 3 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const colourData = new Float32Array(colourAmt * 3);
  for (let c = 0; c < colourAmt; c++) {
    colourData[c * 3] = colours[c][0];
    colourData[c * 3 + 1] = colours[c][1];
    colourData[c * 3 + 2] = colours[c][2];
  }
  device.queue.writeBuffer(colourBuffer, 0, colourData.buffer);

  for (const engine in engines) {
    engines[engine].start(
      device,
      uniformBuffer,
      simBuffer,
      matrixBuffer,
      particleBuffers,
      particleAmt,
      cellAmt,
    );
  }

  renderBindGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: cameraBuffer,
        },
      },
      {
        binding: 2,
        resource: {
          buffer: colourBuffer,
        },
      },
    ],
  });
}

let lastTime = 0;

function update() {
  requestAnimationFrame(update);
  if (!device || !context) return;

  const start = performance.now();
  const delta = (start - lastTime) / 1000;
  lastTime = start;

  camera.x = lerp5(camera.x, tcamera.x, delta * 50);
  camera.y = lerp5(camera.y, tcamera.y, delta * 50);
  camera.zoom = lerp5(camera.zoom, tcamera.zoom, delta * 50);

  const commandEncoder = device.createCommandEncoder();

  if (uniformBuffer) {
    // uniformData[0] = canvas.width;
    // uniformData[1] = canvas.height;
    // uniformData[2] = Math.floor(Math.random() * 10000);

    uniformData[0] = canvas.width / canvas.height;

    uniformData[4] = mouse.x;
    uniformData[5] = mouse.y;
    uniformData[6] = mouse.down;
    uniformData[7] = mouse.type;

    device.queue.writeBuffer(uniformBuffer, 0, uniformData);
  }

  if (cameraBuffer) {
    cameraData[0] = camera.x;
    cameraData[1] = camera.y;
    cameraData[2] = camera.zoom;

    device.queue.writeBuffer(cameraBuffer, 0, cameraData);
  }

  for (let i = 0; i < multistep; i++) {
    tick(commandEncoder);
  }

  render(context, commandEncoder);

  const commands = commandEncoder.finish();
  device.queue.submit([commands]);

  const cpuTime = performance.now() - start;
  times.general['cpu time'] = cpuTime.toFixed(2) + 'ms';

  for (const engine2 in engines) {
    if (engine == engine2) {
      engines[engine2].updateDisplays(times[engine2]);
    } else {
      engines[engine2].cancelDisplays();
    }
  }

  readTimestamp('render').then((time) => {
    times.general['render time'] = time.toFixed(2) + 'ms';
  });

  let timeContent = '';
  for (const sim in times) {
    for (const time in times[sim]) {
      if (times[sim][time]) {
        timeContent += `${time}: ${times[sim][time]} <br>`;
      }
    }
  }

  timesDisplay.innerHTML = timeContent;

  fpsc++;
}

requestAnimationFrame(update);
// setInterval(update, 1000 / 60);

const particleAmtI = document.getElementById(
  'particle-amount',
) as HTMLInputElement;

particleAmtI.value = particleAmt + '';

const newSimBtn = document.getElementById('newSimBtn') as HTMLButtonElement;

newSimBtn.onclick = () => {
  const particleAmtN = parseInt(particleAmtI.value);
  if (isNaN(particleAmtN)) return;
  particleAmt = particleAmtN;
  matrix = makeRandomMatrix();
  startParticles();
};

const fpsDisplay = document.getElementById('fps') as HTMLHeadingElement;

setInterval(() => {
  fpsDisplay.textContent = `FPS: ${fpsc}`;
  fpsc = 0;
}, 1000);

const engineSelect = document.getElementById('engine') as HTMLSelectElement;

engineSelect.onchange = () => {
  engine = engineSelect.value;
  for (const sim in times) {
    if (sim == 'general') continue;
    for (const time in times[sim]) {
      times[sim][time] = engine == sim ? 'a' : '';
    }
    if (engine != sim) {
      engines[sim].cancelDisplays();
    }
  }
};
