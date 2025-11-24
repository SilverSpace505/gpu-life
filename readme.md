# GPU Life
A little simulation of particle life made using webgpu and typescript.

The algortihm for the particle movement is entirely based of particle life. It's just been moved onto a compute shader to allow for larger numbers of particles.

The movement of the particles is done using 2 ping pong buffers going through a compute shader. Then the rendering is done using a basic vertex and fragment shader each frame.