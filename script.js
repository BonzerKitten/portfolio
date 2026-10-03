const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Email
   The address is stored encoded in the markup so spam scrapers reading the page
   source don't find it: hex bytes, the first is a key XORed with the rest.
   ========================================================================== */

for (const element of document.querySelectorAll('[data-email]')) {
	const [key, ...bytes] = element.dataset.email.match(/../g).map((hex) => parseInt(hex, 16));
	const address = String.fromCharCode(...bytes.map((byte) => byte ^ key));
	element.textContent = address;
	if (element.tagName === 'A') element.href = `mailto:${address}`;
}

/* Navigation and scroll reveal
   ========================================================================== */

const nav = document.querySelector('.nav');
const heroTitle = document.querySelector('.hero__title');

// The bar gets its background just before the hero title would slide under it.
const updateNav = () => nav.classList.toggle('is-scrolled', heroTitle.getBoundingClientRect().top < nav.offsetHeight + 16);
addEventListener('scroll', updateNav, { passive: true });
addEventListener('resize', updateNav, { passive: true });
updateNav();

const revealObserver = new IntersectionObserver((entries) => {
	for (const entry of entries) {
		if (!entry.isIntersecting) continue;
		entry.target.classList.add('is-visible');
		revealObserver.unobserve(entry.target);
	}
}, { rootMargin: '0px 0px -8% 0px' });

for (const element of document.querySelectorAll('[data-reveal]')) revealObserver.observe(element);

/* Hero shader: an erosion dissolve with an emissive edge.
   A noise pattern is compared against a threshold; wherever the noise falls
   below it the surface burns away to reveal a blueprint grid underneath. The
   threshold is highest along two edges of the screen (left and right on wide
   screens, top and bottom on narrow ones), where shifting noise keeps the
   erosion alive, plus a "burn" texture that the pointer paints into and that
   heals over time.
   ========================================================================== */

const VERTEX = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

// Burn texture update: blur and fade what is there, then stamp the pointer's
// path with a wide, soft brush. The gentle falloff is what lets the erosion
// pattern show through as a ragged edge instead of a clean outline.
const BURN_FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D uPrevious;
uniform vec2 uSize;
uniform vec2 uFrom;
uniform vec2 uTo;
uniform float uAspect;
uniform float uStrength;
uniform float uDecay;
out vec4 outColor;

void main() {
	vec2 uv = gl_FragCoord.xy / uSize;
	vec2 texel = 1.0 / uSize;
	float around = texture(uPrevious, uv + vec2(texel.x, 0.0)).r + texture(uPrevious, uv - vec2(texel.x, 0.0)).r
		+ texture(uPrevious, uv + vec2(0.0, texel.y)).r + texture(uPrevious, uv - vec2(0.0, texel.y)).r;
	float burn = max(mix(texture(uPrevious, uv).r, around * 0.25, 0.35) - uDecay, 0.0);

	// Distance to the segment the pointer travelled since the last frame.
	vec2 scale = vec2(uAspect, 1.0);
	vec2 a = uFrom * scale, b = uTo * scale, p = uv * scale;
	vec2 ab = b - a;
	float along = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
	float d = length(p - a - ab * along);

	outColor = vec4(max(burn, smoothstep(0.27, 0.0, d) * 0.62 * uStrength), 0.0, 0.0, 1.0);
}`;

const RENDER_FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D uBurn;
uniform vec2 uResolution;
uniform float uTime;
uniform float uInset; // gap between the screen edge and the content, in screen heights
uniform vec2 uBand; // narrow screens: strip under the labels, and reach beyond it (both in screen heights)
out vec4 outColor;

float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float noise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
		mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
		u.y
	);
}

float fbm(vec2 p) {
	float value = 0.0, amplitude = 0.5;
	mat2 octave = mat2(1.6, 1.2, -1.2, 1.6);
	for (int i = 0; i < 5; i++) {
		value += amplitude * noise(p);
		p = octave * p;
		amplitude *= 0.5;
	}
	return value;
}

float gridLines(vec2 p) {
	vec2 distanceToLine = abs(fract(p - 0.5) - 0.5) / fwidth(p);
	return 1.0 - clamp(min(distanceToLine.x, distanceToLine.y), 0.0, 1.0);
}

void main() {
	vec2 uv = gl_FragCoord.xy / uResolution;
	vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
	float t = uTime;

	// The erosion pattern, and the threshold it is tested against.
	float pattern = fbm(p * 3.2 + 11.0) * 0.72 + fbm(p * 15.0 + 3.0) * 0.28;
	// Two noise layers sliding against each other: the result churns in place
	// rather than drifting off screen.
	float churn = 0.5 * (fbm(p * 1.1 + vec2(t * 0.11, -t * 0.075) + 40.0) + fbm(p * 1.7 - vec2(t * 0.085, t * 0.11) + 80.0));
	float wobble = fbm(p * 2.6 + vec2(-t * 0.16, t * 0.13) + 20.0);

	// Ambient erosion hugs two edges of the screen. On wide screens these are
	// the left and right, reaching in only as far as the empty margin beside the
	// content allows. Narrow screens have no such margin, so the erosion moves
	// to the top and bottom instead: the strip holding the navigation and scroll
	// labels is burnt through completely, and the ragged front sits beyond it.
	float aspect = uResolution.x / uResolution.y;
	float fromEdge = 0.5 - abs(p.y);
	float mask = uBand.y > 0.0
		? smoothstep(uBand.x + uBand.y, uBand.x, fromEdge)
		: smoothstep(clamp(uInset * 1.3, 0.02, 0.62), 0.0, 0.5 * aspect - abs(p.x));
	float threshold = mask * (0.08 + 0.95 * churn + 0.4 * wobble) + texture(uBurn, uv).r * (0.55 + 0.95 * wobble);
	if (uBand.y > 0.0) threshold = max(threshold, smoothstep(uBand.x * 1.2, uBand.x * 0.8, fromEdge));
	float d = pattern - threshold; // above zero the surface is intact
	float lit = smoothstep(0.0, 0.06, threshold);

	// Intact surface, scorched as it nears the edge.
	vec3 surface = vec3(0.086, 0.086, 0.094) + 0.03 * (fbm(p * 1.6 + 5.0) - 0.5);
	surface *= mix(1.0, 0.45 + 0.55 * smoothstep(0.0, 0.18, d), lit);

	// What is underneath: a dark blueprint grid, glowing near the edge.
	vec2 cell = p * 16.0 + vec2(0.0, t * 0.05);
	vec3 under = vec3(0.04, 0.04, 0.044);
	under += vec3(0.95) * (gridLines(cell) * 0.07 + gridLines(cell / 4.0) * 0.11);
	under += vec3(0.965, 0.45, 0.07) * exp(d * 11.0) * 0.3;

	vec3 color = mix(under, surface, smoothstep(-0.004, 0.004, d));

	// The emissive edge: orange falloff with a hot core.
	float edge = abs(d);
	color += vec3(0.965, 0.45, 0.07) * smoothstep(0.075, 0.0, edge) * (d > 0.0 ? 0.85 : 0.45) * lit;
	color += vec3(1.0, 0.84, 0.6) * smoothstep(0.014, 0.0, edge) * lit;

	color *= 1.0 - 0.35 * smoothstep(0.4, 1.3, length(p));
	color += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0;
	outColor = vec4(color, 1.0);
}`;

function runDissolve(canvas, content, title) {
	const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' });
	if (!gl) return;

	const compile = (type, source) => {
		const shader = gl.createShader(type);
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
		return shader;
	};

	const link = (fragmentSource, uniformNames) => {
		const program = gl.createProgram();
		gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
		gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
		gl.bindAttribLocation(program, 0, 'position');
		gl.linkProgram(program);
		const uniforms = {};
		for (const name of uniformNames) uniforms[name] = gl.getUniformLocation(program, name);
		return { program, uniforms };
	};

	const burnPass = link(BURN_FRAGMENT, ['uPrevious', 'uSize', 'uFrom', 'uTo', 'uAspect', 'uStrength', 'uDecay']);
	const renderPass = link(RENDER_FRAGMENT, ['uBurn', 'uResolution', 'uTime', 'uInset', 'uBand']);

	// A single triangle that covers the whole canvas.
	gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

	// The burn texture is rendered back and forth between two targets. Half-float
	// keeps the fade smooth; 8-bit is the fallback where that isn't renderable.
	const halfFloat = Boolean(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
	const targets = [0, 1].map(() => ({ texture: gl.createTexture(), framebuffer: gl.createFramebuffer() }));
	const burnSize = { width: 1, height: 1 };

	const allocateTargets = () => {
		burnSize.width = Math.max(1, Math.round(canvas.width / 4));
		burnSize.height = Math.max(1, Math.round(canvas.height / 4));
		for (const target of targets) {
			gl.bindTexture(gl.TEXTURE_2D, target.texture);
			if (halfFloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, burnSize.width, burnSize.height, 0, gl.RED, gl.HALF_FLOAT, null);
			else gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, burnSize.width, burnSize.height, 0, gl.RED, gl.UNSIGNED_BYTE, null);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
			gl.clearColor(0, 0, 0, 1);
			gl.clear(gl.COLOR_BUFFER_BIT);
		}
	};

	const pointer = { x: 0.5, y: 0.5, previousX: 0.5, previousY: 0.5, active: false };

	const movePointer = (event) => {
		const rect = canvas.getBoundingClientRect();
		const x = (event.clientX - rect.left) / rect.width;
		const y = 1 - (event.clientY - rect.top) / rect.height;
		const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
		// Start a fresh stroke rather than a line from wherever the pointer last was.
		if (inside && !pointer.active) {
			pointer.previousX = x;
			pointer.previousY = y;
		}
		pointer.x = x;
		pointer.y = y;
		pointer.active = inside;
	};

	if (!reducedMotion) {
		addEventListener('pointermove', movePointer, { passive: true });
		addEventListener('pointerdown', movePointer, { passive: true });
		addEventListener('pointerup', (event) => { if (event.pointerType !== 'mouse') pointer.active = false; });
		addEventListener('pointercancel', () => { pointer.active = false; });
		document.documentElement.addEventListener('pointerleave', () => { pointer.active = false; });
	}

	let source = 0;
	let lastSeconds = 0;
	let inset = 0;
	let band = [0, 0];

	const draw = (seconds) => {
		const delta = Math.min(seconds - lastSeconds, 0.1);
		lastSeconds = seconds;
		const destination = 1 - source;

		gl.useProgram(burnPass.program);
		gl.bindFramebuffer(gl.FRAMEBUFFER, targets[destination].framebuffer);
		gl.viewport(0, 0, burnSize.width, burnSize.height);
		gl.bindTexture(gl.TEXTURE_2D, targets[source].texture);
		gl.uniform1i(burnPass.uniforms.uPrevious, 0);
		gl.uniform2f(burnPass.uniforms.uSize, burnSize.width, burnSize.height);
		gl.uniform2f(burnPass.uniforms.uFrom, pointer.previousX, pointer.previousY);
		gl.uniform2f(burnPass.uniforms.uTo, pointer.x, pointer.y);
		gl.uniform1f(burnPass.uniforms.uAspect, canvas.width / canvas.height);
		gl.uniform1f(burnPass.uniforms.uStrength, pointer.active ? 1 : 0);
		gl.uniform1f(burnPass.uniforms.uDecay, halfFloat ? delta * 0.2 : 1 / 255);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		pointer.previousX = pointer.x;
		pointer.previousY = pointer.y;

		gl.useProgram(renderPass.program);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.bindTexture(gl.TEXTURE_2D, targets[destination].texture);
		gl.uniform1i(renderPass.uniforms.uBurn, 0);
		gl.uniform2f(renderPass.uniforms.uResolution, canvas.width, canvas.height);
		gl.uniform1f(renderPass.uniforms.uTime, seconds);
		gl.uniform1f(renderPass.uniforms.uInset, inset);
		gl.uniform2f(renderPass.uniforms.uBand, band[0], band[1]);
		gl.drawArrays(gl.TRIANGLES, 0, 3);

		source = destination;
	};

	// Only animate while the canvas is on screen and the tab is visible.
	let onScreen = true;
	let frame = 0;
	const loop = (milliseconds) => {
		frame = 0;
		draw(milliseconds / 1000);
		schedule();
	};
	const schedule = () => {
		if (!frame && onScreen && !document.hidden && !reducedMotion) frame = requestAnimationFrame(loop);
	};

	const resizeObserver = new ResizeObserver(() => {
		const pixelRatio = Math.min(devicePixelRatio, 1.5);
		canvas.width = Math.round(canvas.clientWidth * pixelRatio);
		canvas.height = Math.round(canvas.clientHeight * pixelRatio);
		inset = (content.getBoundingClientRect().left - canvas.getBoundingClientRect().left) / canvas.clientHeight;
		// Too little side margin for the erosion: use the top and bottom instead,
		// reaching into the free space between the label strips and the title.
		const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
		const box = canvas.getBoundingClientRect();
		const titleBox = title.getBoundingClientRect();
		const strip = 4.8 * rem;
		const free = Math.min(titleBox.top - box.top, box.bottom - titleBox.bottom) - strip;
		const reach = Math.min(Math.max(free * 0.7, 5 * rem), 16 * rem);
		band = inset < 0.07 ? [strip / canvas.clientHeight, reach / canvas.clientHeight] : [0, 0];
		allocateTargets();
		if (reducedMotion) draw(30);
	});
	resizeObserver.observe(canvas);
	resizeObserver.observe(title); // its size changes when the web font arrives

	new IntersectionObserver(([entry]) => {
		onScreen = entry.isIntersecting;
		schedule();
	}).observe(canvas);

	document.addEventListener('visibilitychange', schedule);
	schedule();
}

runDissolve(document.querySelector('.hero__canvas'), document.querySelector('.hero__inner'), heroTitle);
