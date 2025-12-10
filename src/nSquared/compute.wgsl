
struct Uniforms {
    aspect: f32,
    mouse: vec4<f32>,
    size: f32
}

struct Sim {
    colours: f32,
    beta: f32,
    rMax: f32,
    force: f32,
    friction: f32,
    dt: f32,
    cellSize: f32,
    cellAmt: f32,
    avoidance: f32,
    worldSize: f32,
    border: f32,
    vortex: f32,
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

fn force(r: f32, a: f32) -> vec2f {
    let beta = sim.beta;
	if (r < beta) {
		return vec2f(0, r / beta - 1);
	} else if (beta < r && r < 1) {
		return vec2f(a * (1 - abs(2 * r - 1 - beta) / (1 - beta)), 0);
	} else {
		return vec2f(0, 0);
	}
}

fn getForce(pi: u32) -> vec2f {
    let p= input[pi];
    var totalForceX = 0f;
    var totalForceY = 0f;

    var avoidForceX = 0f;
    var avoidForceY = 0f;

    let l = arrayLength(&input);
    let mrs = sim.rMax * sim.rMax;

    var div = 0f;

    for (var i = 0u; i < l; i++) {
        if (i == pi) {
            continue;
        }
        let ip = input[i];
        let rx = ip.pos.x - p.pos.x;
        let ry = ip.pos.y - p.pos.y;

        let rs = rx * rx + ry * ry;
        if (rs > 0 && rs < mrs) {
            let r = sqrt(rs);
            let f = force(r / sim.rMax, matrix[u32(p.colour) * u32(sim.colours) + u32(ip.colour)]);
            totalForceX += rx / r * f.x;
            totalForceY += ry / r * f.x;

            avoidForceX += rx / r * f.y;
            avoidForceY += ry / r * f.y;

            div += pow(max(0, -f.y), 1) / 10 * sim.avoidance;
        } else if (rs == 0) {
            avoidForceX += (f32(pi)*20293.302 % 4932.329) / 100000;
        }
    }

    totalForceX *= sim.rMax * sim.force / (1 + div);
    totalForceY *= sim.rMax * sim.force / (1 + div);

    return vec2f(totalForceX + avoidForceX, totalForceY + avoidForceY);
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

    let d = sqrt(p.pos.x * p.pos.x + p.pos.y * p.pos.y) / sim.worldSize;

    if (sim.vortex > 0) {
        p.vel.x -= p.pos.x * sim.dt * 5 * cos(d * 30 * p.pos.x * p.pos.y / matrix[u32(p.colour) * 10]) * sin(p.pos.x * 10 * matrix[u32(p.colour)]);
        p.vel.y -= p.pos.y * sim.dt * 5 * cos(d * 30 * p.pos.y * p.pos.x / matrix[u32(p.colour) * 10]) * cos(p.pos.y * 10 * matrix[u32(p.colour)]);

        p.vel.x -= p.pos.y * sim.dt * 5 * pow(d / 0.5, 2) * sin(d * 10 + matrix[u32(p.colour) + 10]);
        p.vel.y += p.pos.x * sim.dt * 5 * pow(d / 0.5, 2) * sin(d * 10 + matrix[u32(p.colour) + 10]);
    }

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

    if (sim.border > 0 && d > 0.9) {
        let f = (d - 0.9) * 10;
        p.vel.x -= p.pos.x * f;
        p.vel.y -= p.pos.y * f;
    }

    p.pos.x += p.vel.x * sim.dt;
    p.pos.y += p.vel.y * sim.dt;

    output[global_id.x] = p;
}