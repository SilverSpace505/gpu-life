
struct Uniforms {
    aspect: f32,
    mouse: vec4<f32>
}

struct Sim {
    colours: f32,
    beta: f32,
    rMax: f32,
    force: f32,
    friction: f32,
    dt: f32
}

struct Particle {
    pos: vec2f,
    vel: vec2f,
    colour: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<uniform> sim: Sim;
@group(0) @binding(2) var<storage, read> matrix: array<f32>;

@group(0) @binding(3) var<storage, read> input: array<Particle>;
@group(0) @binding(4) var<storage, read_write> output: array<Particle>;

fn force(r: f32, a: f32) -> f32 {
    let beta = sim.beta;
	if (r < beta) {
		return r / beta - 1;
	} else if (beta < r && r < 1) {
		return a * (1 - abs(2 * r - 1 - beta) / (1 - beta));
	} else {
		return 0;
	}
}

fn getForce(pi: u32) -> vec2f {
    let p= input[pi];
    var totalForceX = 0f;
    var totalForceY = 0f;

    for (var i = 0u; i < arrayLength(&input); i++) {
        if (i == pi) {
            continue;
        }
        let ip = input[i];
        var rx = ip.pos.x - p.pos.x;
        var ry = ip.pos.y - p.pos.y;

        if (rx > uniforms.aspect) {
            rx -= 2 * uniforms.aspect;
        } else if (rx < -uniforms.aspect) {
            rx += 2 * uniforms.aspect;
        }

        if (ry > 1) {
            ry -= 2;
        } else if (ry < -1) {
            ry += 2;
        }

        let r = sqrt(rx * rx + ry * ry);
        if (r > 0 && r < sim.rMax) {
            let f = force(r / sim.rMax, matrix[u32(p.colour) * u32(sim.colours) + u32(ip.colour)]);
            totalForceX += rx / r * f;
            totalForceY += ry / r * f;
        }
    }

    totalForceX *= sim.rMax * sim.force;
    totalForceY *= sim.rMax * sim.force;

    return vec2f(totalForceX, totalForceY);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x >= arrayLength(&output)) {
        return;
    }
    var p  = input[global_id.x];

    let mx = uniforms.mouse.x;

    let force = getForce(global_id.x);
    // let force = vec2f(10000, 0);

    p.vel.x *= sim.friction;
    p.vel.y *= sim.friction;

    p.vel.x += force.x * sim.dt;
    p.vel.y += force.y * sim.dt;

    if (uniforms.mouse.z != 0) {
        let dx = uniforms.mouse.x - p.pos.x;
        let dy = uniforms.mouse.y - p.pos.y;

        let d = sqrt(dx * dx + dy * dy);
        if (d < sim.rMax) {
            if (uniforms.mouse.z == 1) {
                p.vel.x += dx * 3;
                p.vel.y += dy * 3;
            } else {
                p.vel.x -=  dx * 3;
                p.vel.y -= dy * 3;
            }
        }
    }

    p.pos.x += p.vel.x * sim.dt;
    p.pos.y += p.vel.y * sim.dt;

    if (p.pos.x < -uniforms.aspect) {
        p.pos.x = uniforms.aspect;
    }
    if (p.pos.x > uniforms.aspect) {
        p.pos.x = -uniforms.aspect;
    }

    if (p.pos.y < -1) {
        p.pos.y = 1;
    }
    if (p.pos.y > 1) {
        p.pos.y = -1;
    }

    output[global_id.x] = p;
}