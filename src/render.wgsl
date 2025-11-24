
struct Uniforms {
    aspect: f32,
    mouse: vec4<f32>
}

struct Particle {
    @location(0) pos: vec2f,
    @location(1) vel: vec2f,
    @location(2) colour: f32
}

struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) colour: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn vertex(
    particle: Particle,
    @builtin(vertex_index) vertexIndex: u32
) -> VertexOutput {
    let a = uniforms.aspect;

    var positions = array<vec2f, 6>(
        vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
        vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
    );

    let offset = positions[vertexIndex] * 0.005;
    let worldPos = particle.pos + offset;

    var output: VertexOutput;
    output.pos = vec4f(worldPos.x / a, worldPos.y, 0.0, 1.0);
    output.colour = particle.colour;
    return output;
}

@group(0) @binding(1) var<storage, read> colours: array<f32>;

@fragment
fn fragment(@location(0) colour: f32) -> @location(0) vec4f {
    return vec4f(colours[u32(colour) * 3], colours[u32(colour) * 3 + 1], colours[u32(colour) * 3 + 2], 1.0);
}