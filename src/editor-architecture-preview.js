import { getAsset } from './config/config.js';
import { generateMaterialArrayData } from './world/materials.js';

const MODES = [
  ['pbr', 'Simulated PBR'], ['albedo', 'Albedo'], ['normal', 'Normal'],
  ['height', 'Height'], ['rmao', 'Rough · Metal · AO']
];

function materialIds(spec, fallback = 1) {
  if (typeof spec === 'number') return [spec];
  const values = Array.isArray(spec) ? spec : (spec?.values || spec?.ids || []);
  const ids = values.map(value => typeof value === 'number' ? value : value?.id).filter(Number.isFinite);
  return ids.length ? [...new Set(ids)] : [fallback];
}

function drawTexture(canvas, arrays, surface, id, mode, angle) {
  const data = arrays[surface];
  if (!data) return;
  const size = arrays.texSize;
  const layer = Math.max(0, Math.min((arrays[`${surface === 'walls' ? 'wall' : surface === 'floors' ? 'floor' : 'ceil'}Count`] || 1) - 1, id - 1));
  const layerPixelOffset = layer * size * size;
  const layerRgbaOffset = layerPixelOffset * 4;
  const image = new ImageData(size, size);
  const lx = Math.cos(angle) * .68, ly = Math.sin(angle) * .68, lz = .72;
  const lightLength = Math.hypot(lx, ly, lz);
  for (let pixel = 0; pixel < size * size; pixel++) {
    const source = layerRgbaOffset + pixel * 4;
    const scalar = layerPixelOffset + pixel;
    const target = pixel * 4;
    const ar = data.albedo[source], ag = data.albedo[source + 1], ab = data.albedo[source + 2];
    const nr = data.normal[source], ng = data.normal[source + 1], nb = data.normal[source + 2];
    const rough = data.roughMetalAO[source] / 255;
    const metal = data.roughMetalAO[source + 1] / 255;
    const ao = data.roughMetalAO[source + 3] / 255;
    let r = ar, g = ag, b = ab;
    if (mode === 'normal') { r = nr; g = ng; b = nb; }
    else if (mode === 'height') { r = g = b = data.height[scalar]; }
    else if (mode === 'rmao') { r = rough * 255; g = metal * 255; b = ao * 255; }
    else if (mode === 'pbr') {
      const nx = nr / 127.5 - 1, ny = ng / 127.5 - 1, nz = nb / 127.5 - 1;
      const diffuse = Math.max(0, (nx * lx + ny * ly + nz * lz) / lightLength);
      const halfZ = Math.max(0, nz * .72 + nx * lx * .25 + ny * ly * .25);
      const specular = Math.pow(halfZ, 3 + rough * 30) * (0.08 + metal * 0.9);
      const shade = (0.2 + diffuse * 0.9) * (0.48 + ao * 0.52);
      r = ar * shade * (1 - metal * .2) + specular * 255;
      g = ag * shade * (1 - metal * .2) + specular * 245;
      b = ab * shade * (1 - metal * .2) + specular * 225;
    }
    image.data[target] = Math.max(0, Math.min(255, r));
    image.data[target + 1] = Math.max(0, Math.min(255, g));
    image.data[target + 2] = Math.max(0, Math.min(255, b));
    image.data[target + 3] = 255;
  }
  canvas.width = size; canvas.height = size;
  canvas.getContext('2d').putImageData(image, 0, 0);
}

export async function buildArchitecturePreview(config) {
  const root = document.createElement('section');
  root.className = 'architecture-preview';
  root.dataset.previewReady = 'false';
  root.innerHTML = '<div class="architecture-preview-loading">Baking material channels…</div>';
  try {
    const [walls, floors, ceils, proc] = await Promise.all([
      getAsset('materials', 'walls'), getAsset('materials', 'floors'), getAsset('materials', 'ceils'), getAsset('config/rendering', 'materials-proc')
    ]);
    const arrays = generateMaterialArrayData(walls?.materials || [], floors?.materials || [], ceils?.materials || [], proc || {});
    const materialCatalogs = { walls:walls?.materials || [], floors:floors?.materials || [], ceils:ceils?.materials || [] };
    let mode = 'pbr';
    let angle = -0.75;
    root.innerHTML = '';
    const heading = document.createElement('div'); heading.className = 'architecture-preview-heading';
    heading.innerHTML = '<div><span>Material browser</span><h2>Architecture × room type</h2><p>Actual generated channels. Simulated PBR combines albedo, normal, height, roughness, metalness and AO.</p></div>';
    const controls = document.createElement('div'); controls.className = 'architecture-preview-controls';
    const modes = document.createElement('div'); modes.className = 'architecture-preview-modes';
    MODES.forEach(([id, label]) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.mode = id;
      button.className = id === mode ? 'active' : '';
      button.onclick = () => { mode = id; modes.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button)); redraw(); };
      modes.appendChild(button);
    });
    const light = document.createElement('label'); light.innerHTML = '<span>Fake light</span>';
    const slider = document.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = '360'; slider.value = '317'; slider.setAttribute('aria-label', 'Fake PBR light angle');
    slider.oninput = () => { angle = Number(slider.value) * Math.PI / 180; redraw(); };
    light.appendChild(slider); controls.appendChild(modes); controls.appendChild(light); heading.appendChild(controls); root.appendChild(heading);

    const grid = document.createElement('div'); grid.className = 'architecture-preview-grid'; root.appendChild(grid);
    for (const architecture of config.architectures || []) {
      const group = document.createElement('article'); group.className = 'architecture-preview-group'; group.dataset.architectureId = architecture.id;
      const ramps = architecture.palette?.accentRamps || [];
      group.innerHTML = `<header><div><b>A${architecture.numericId}</b><h3>${architecture.name}</h3><p>${architecture.description || ''}</p></div><div class="architecture-ramp">${ramps.map(ramp => `<i title="${ramp.id}" style="--from:rgb(${ramp.from});--to:rgb(${ramp.to})"></i>`).join('')}</div></header>`;
      const types = document.createElement('div'); types.className = 'architecture-type-grid'; group.appendChild(types);
      for (const type of config.types || []) {
        const mapping = architecture.materials?.[type.id] || architecture.materials?.plain || {};
        const card = document.createElement('section'); card.className = 'architecture-type-card'; card.dataset.typeId = type.id;
        card.innerHTML = `<h4><b>T${type.numericId}</b>${type.name}</h4><div class="architecture-surfaces"></div><small>${(type.storyTags || []).join(' · ')}</small>`;
        const surfaceRoot = card.querySelector('.architecture-surfaces');
        [['walls','wall'], ['floors','floor'], ['ceils','ceil']].forEach(([surface, key]) => {
          materialIds(mapping[key]).forEach((id, variantIndex, variants) => {
            const figure = document.createElement('figure');
            figure.dataset.surfaceGroup = key;
            const canvas = document.createElement('canvas'); canvas.dataset.surface = surface; canvas.dataset.materialId = String(id);
            figure.appendChild(canvas);
            const materialName = materialCatalogs[surface].find(material => material.id === id)?.name || 'unknown';
            const variant = variants.length > 1 ? ` ${variantIndex + 1}/${variants.length}` : '';
            const caption = document.createElement('figcaption'); caption.textContent = `${key}${variant} · M${id} · ${materialName}`; caption.title = caption.textContent;
            figure.appendChild(caption); surfaceRoot.appendChild(figure);
          });
        });
        types.appendChild(card);
      }
      grid.appendChild(group);
    }
    function redraw() {
      root.dataset.previewMode = mode;
      root.querySelectorAll('canvas[data-surface]').forEach(canvas => drawTexture(canvas, arrays, canvas.dataset.surface, Number(canvas.dataset.materialId), mode, angle));
    }
    redraw(); root.dataset.previewReady = 'true';
  } catch (error) {
    root.innerHTML = `<div class="architecture-preview-error">Material preview failed: ${error?.message || error}</div>`;
  }
  return root;
}
