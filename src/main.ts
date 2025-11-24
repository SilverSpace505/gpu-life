const canvas = document.getElementById('canvas') as HTMLCanvasElement;

import computeShader from './compute.wgsl?raw';
import { mouse } from './input';
import renderShaders from './render.wgsl?raw';

const uniformsSize = 8;
const uniformData = new Float32Array(uniformsSize);
const workgroupSize = 64;

const simSize = 6;
const simData = new Float32Array(simSize);

const dt = 0.02;
const rMax = 0.4;
const forceFactor = 1;
const beta = 0.1;
const frictionHalfLife = 0.04;

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

const colourAmt = 10;
const colours = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 1, 0],
  [0, 1, 1],
  [1, 0, 1],
  [1, 0.5, 0],
  [0, 0.5, 1],
  [0.5, 0, 1],
  [0.5, 1, 0],
];
let matrix = makeRandomMatrix();

const particleStride = 24;

const multistep = 1;

let particleAmt = 5000;

let device: GPUDevice | undefined;
let context: GPUCanvasContext | undefined;
let uniformBuffer: GPUBuffer | undefined;
let simBuffer: GPUBuffer | undefined;
let pipeline: GPUComputePipeline | undefined;
let renderPipeline: GPURenderPipeline | undefined;

let matrixBuffer: GPUBuffer | undefined;
let colourBuffer: GPUBuffer | undefined;

let particleBuffers: [GPUBuffer, GPUBuffer] | undefined;

let bindGroups: [GPUBindGroup, GPUBindGroup] | undefined;
let renderBindGroup: GPUBindGroup | undefined;

let alternate = 0;
let fpsc = 0;

(async () => {
  const adapter = await navigator.gpu.requestAdapter({
    featureLevel: 'compatibility',
  });

  if (!adapter) return;

  device = await adapter.requestDevice();
  context = canvas.getContext('webgpu') ?? undefined;

  if (!context) return;

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  context.configure({ device, format: presentationFormat });

  //

  uniformBuffer = device.createBuffer({
    size: uniformsSize * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  simBuffer = device.createBuffer({
    size: simSize * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  //

  const module = device.createShaderModule({
    code: computeShader,
  });

  pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module,
      entryPoint: 'main',
    },
  });

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

  startParticles();
})();

function tick(commandEncoder: GPUCommandEncoder) {
  if (!device || !pipeline || !bindGroups) return;

  const passEncoder = commandEncoder.beginComputePass();
  passEncoder.setPipeline(pipeline);
  passEncoder.setBindGroup(0, bindGroups[alternate]);
  passEncoder.dispatchWorkgroups(Math.ceil(particleAmt / workgroupSize));
  passEncoder.end();

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

  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(renderPipeline);
  passEncoder.setVertexBuffer(0, particleBuffers[(alternate + 1) % 2]);
  passEncoder.setBindGroup(0, renderBindGroup);
  passEncoder.draw(6, particleAmt, 0, 0);
  passEncoder.end();
}

function startParticles() {
  if (!device || !pipeline || !uniformBuffer || !renderPipeline || !simBuffer)
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
  for (let i = 0; i < particleAmt; i++) {
    data[i * 6] = Math.random() * 2 - 1;
    data[i * 6 + 1] = Math.random() * 2 - 1;
    data[i * 6 + 2] = 0;
    data[i * 6 + 3] = 0;
    data[i * 6 + 4] = Math.floor(Math.random() * colourAmt);

    data[i * 6 + 5] = 0;
    // data[i * 8 + 6] = 0;
    // data[i * 8 + 7] = 0;
  }

  device.queue.writeBuffer(particleBuffers[0], 0, data.buffer);

  simData[0] = colourAmt;
  simData[1] = beta;
  simData[2] = rMax;
  simData[3] = forceFactor;
  simData[4] = Math.pow(0.5, dt / frictionHalfLife);
  simData[5] = dt;
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

  const groups = [];
  for (let i = 0; i < 2; i++) {
    groups.push(
      device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
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
              buffer: simBuffer,
            },
          },
          {
            binding: 2,
            resource: {
              buffer: matrixBuffer,
            },
          },
          {
            binding: 3,
            resource: {
              buffer: particleBuffers[i],
            },
          },
          {
            binding: 4,
            resource: {
              buffer: particleBuffers[1 - i],
            },
          },
        ],
      }),
    );
  }
  bindGroups = [groups[0], groups[1]];

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
          buffer: colourBuffer,
        },
      },
    ],
  });
}

function update() {
  requestAnimationFrame(update);
  if (!device || !context) return;

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

  for (let i = 0; i < multistep; i++) {
    tick(commandEncoder);
  }

  render(context, commandEncoder);

  const commands = commandEncoder.finish();
  device.queue.submit([commands]);

  fpsc++;
}

requestAnimationFrame(update);

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
