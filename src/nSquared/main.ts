let pipeline: GPUComputePipeline | undefined;
let bindGroups: [GPUBindGroup, GPUBindGroup] | undefined;

import computeShader from './compute.wgsl?raw';
import {
  linkComputeTimestamp,
  readTimestamp,
  resolveTimestamp,
  setupTimestamp,
} from '../utils';

const workgroupSize = 64;

export function setup(device: GPUDevice) {
  const module = device.createShaderModule({
    code: computeShader,
  });

  setupTimestamp(device, 'compute');

  pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module,
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
) {
  if (!pipeline) return;
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
}

export function tick(
  device: GPUDevice,
  commandEncoder: GPUCommandEncoder,
  alternate: number,
  particleAmt: number,
) {
  if (!pipeline || !bindGroups) return;
  const passEncoder = commandEncoder.beginComputePass(
    linkComputeTimestamp(device, 'compute'),
  );
  passEncoder.setPipeline(pipeline);
  passEncoder.setBindGroup(0, bindGroups[alternate]);
  passEncoder.dispatchWorkgroups(Math.ceil(particleAmt / workgroupSize));
  passEncoder.end();

  resolveTimestamp(commandEncoder, 'compute');
}

export function updateDisplays(params: Record<string, number>) {
  readTimestamp('compute').then((time) => {
    params.sim = time;
  });
}
