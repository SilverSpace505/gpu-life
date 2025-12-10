import constructShader from './construct.wgsl?raw';
import simShader from './sim.wgsl?raw';
import {
  linkComputeTimestamp,
  readTimestamp,
  resolveTimestamp,
  setupTimestamp,
} from '../utils';

let constructPipeline: GPUComputePipeline | undefined;
let simPipeline: GPUComputePipeline | undefined;

let headsBuffer: GPUBuffer | undefined;
let headsInitBuffer: GPUBuffer | undefined;

let constructBindGroups: [GPUBindGroup, GPUBindGroup] | undefined;
let simBindGroups: [GPUBindGroup, GPUBindGroup] | undefined;

const workgroupSize = 64;

export function setup(device: GPUDevice) {
  const constructModule = device.createShaderModule({
    code: constructShader,
  });

  setupTimestamp(device, 'construct');

  constructPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: constructModule,
      entryPoint: 'main',
    },
  });

  //

  const simModule = device.createShaderModule({
    code: simShader,
  });

  setupTimestamp(device, 'sim');

  simPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: simModule,
      entryPoint: 'main',
    },
  });
}

export function start(
  device: GPUDevice,
  uniformBuffer: GPUBuffer,
  simBuffer: GPUBuffer,
  matrixBuffer: GPUBuffer,
  particleBuffers: [GPUBuffer, GPUBuffer],
  particleAmt: number,
  cellAmt: number,
) {
  if (!constructPipeline || !simPipeline) return;

  headsBuffer = device.createBuffer({
    size: (1 + cellAmt) * Uint32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'headsBuffer',
  });

  headsInitBuffer = device.createBuffer({
    size: (1 + cellAmt) * Uint32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.COPY_SRC,
    mappedAtCreation: true,
    label: 'headsInitBuffer',
  });
  const buffer = new Uint32Array(headsInitBuffer.getMappedRange());

  buffer[0] = 0;
  for (let i = 1; i < buffer.length; ++i) {
    buffer[i] = 0xffffffff;
  }

  headsInitBuffer.unmap();

  const linkedListBuffer = device.createBuffer({
    size:
      (8 * Float32Array.BYTES_PER_ELEMENT + 1 * Uint32Array.BYTES_PER_ELEMENT) *
      particleAmt,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'linkedListBuffer',
  });

  const constructGroups = [];
  for (let i = 0; i < 2; i++) {
    constructGroups.push(
      device.createBindGroup({
        layout: constructPipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: simBuffer,
            },
          },
          {
            binding: 1,
            resource: {
              buffer: particleBuffers[i],
            },
          },
          {
            binding: 2,
            resource: {
              buffer: headsBuffer,
            },
          },
          {
            binding: 3,
            resource: {
              buffer: linkedListBuffer,
            },
          },
        ],
      }),
    );
  }
  constructBindGroups = [constructGroups[0], constructGroups[1]];

  //

  const simGroups = [];
  for (let i = 0; i < 2; i++) {
    simGroups.push(
      device.createBindGroup({
        layout: simPipeline.getBindGroupLayout(0),
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
          {
            binding: 5,
            resource: {
              buffer: headsBuffer,
            },
          },
          {
            binding: 6,
            resource: {
              buffer: linkedListBuffer,
            },
          },
        ],
      }),
    );
  }
  simBindGroups = [simGroups[0], simGroups[1]];
}

export function tick(
  device: GPUDevice,
  commandEncoder: GPUCommandEncoder,
  alternate: number,
  particleAmt: number,
) {
  if (
    !constructPipeline ||
    !simPipeline ||
    !constructBindGroups ||
    !headsInitBuffer ||
    !headsBuffer ||
    !simBindGroups
  )
    return;

  commandEncoder.copyBufferToBuffer(headsInitBuffer, headsBuffer);

  const constructPassEncoder = commandEncoder.beginComputePass(
    linkComputeTimestamp(device, 'construct'),
  );
  constructPassEncoder.setPipeline(constructPipeline);
  constructPassEncoder.setBindGroup(0, constructBindGroups[alternate]);
  constructPassEncoder.dispatchWorkgroups(
    Math.ceil(particleAmt / workgroupSize),
  );
  constructPassEncoder.end();

  resolveTimestamp(commandEncoder, 'construct');

  const simPassEncoder = commandEncoder.beginComputePass(
    linkComputeTimestamp(device, 'sim'),
  );
  simPassEncoder.setPipeline(simPipeline);
  simPassEncoder.setBindGroup(0, simBindGroups[alternate]);
  simPassEncoder.dispatchWorkgroups(Math.ceil(particleAmt / workgroupSize));
  simPassEncoder.end();

  resolveTimestamp(commandEncoder, 'sim');
}

export function updateDisplays(params: Record<string, number>) {
  readTimestamp('construct').then((time) => {
    params.construct = time;
  });
  readTimestamp('sim').then((time) => {
    params.sim = time;
  });
}
