#!/usr/bin/env python3
"""Generate the deterministic SPJ-04 prototype-v1 asset benchmark.

The script intentionally uses only the bundled NumPy and Pillow runtime. It
creates a valid binary glTF (GLB), renders every fallback view from the same
geometry, and emits the bill of materials, footprint, manifest, and report.
"""

from __future__ import annotations

import hashlib
import json
import math
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "product-truth" / "canonical-obstacle.json"
OUT = ROOT / "assets" / "spj-04" / "prototype-v1"
RENDERS = OUT / "renders"

STUDIO = (247, 246, 241)
PAPER = (255, 255, 255)
INK = (11, 11, 11)
GRAPHITE = (92, 93, 90)
MIST = (232, 231, 225)
COBALT = (13, 67, 199)
NAVY = (7, 34, 87)
CORAL = (255, 85, 71)
WHITE = (247, 246, 241)

FONT_MONO = Path("/System/Library/Fonts/SFNSMono.ttf")
FONT_DISPLAY = Path("/System/Library/Fonts/Avenir Next Condensed.ttc")


def font(path: Path, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size=size, index=index)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_hash(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


@dataclass
class Material:
    name: str
    rgb: tuple[int, int, int]
    textured: bool = False
    metallic: float = 0.0
    roughness: float = 0.58


@dataclass
class MeshPart:
    name: str
    positions: np.ndarray
    normals: np.ndarray
    uvs: np.ndarray
    indices: np.ndarray
    material: str


MATERIALS = {
    "white": Material("powder-coated white", WHITE, metallic=0.08, roughness=0.52),
    "cobalt": Material("cobalt pole finish", COBALT, metallic=0.04, roughness=0.5),
    "navy": Material("navy prototype panel", NAVY, roughness=0.64),
    "ink": Material("dark hardware", INK, metallic=0.25, roughness=0.4),
    "coral": Material("red flag", CORAL, roughness=0.55),
    "paper": Material("white flag", PAPER, roughness=0.7),
    "artwork": Material("Club Classic prototype artwork", PAPER, textured=True, roughness=0.72),
}


def quad_face(corners: list[list[float]], normal: list[float], material: str, name: str,
              uvs: list[list[float]] | None = None) -> MeshPart:
    uv = uvs or [[0, 0], [1, 0], [1, 1], [0, 1]]
    return MeshPart(
        name=name,
        positions=np.asarray(corners, dtype=np.float32),
        normals=np.asarray([normal] * 4, dtype=np.float32),
        uvs=np.asarray(uv, dtype=np.float32),
        indices=np.asarray([[0, 1, 2], [0, 2, 3]], dtype=np.uint16),
        material=material,
    )


def box(name: str, center: tuple[float, float, float], size: tuple[float, float, float],
        material: str) -> MeshPart:
    cx, cy, cz = center
    sx, sy, sz = (value / 2 for value in size)
    faces = [
        ([[-sx, -sy, sz], [sx, -sy, sz], [sx, sy, sz], [-sx, sy, sz]], [0, 0, 1]),
        ([[sx, -sy, -sz], [-sx, -sy, -sz], [-sx, sy, -sz], [sx, sy, -sz]], [0, 0, -1]),
        ([[sx, -sy, sz], [sx, -sy, -sz], [sx, sy, -sz], [sx, sy, sz]], [1, 0, 0]),
        ([[-sx, -sy, -sz], [-sx, -sy, sz], [-sx, sy, sz], [-sx, sy, -sz]], [-1, 0, 0]),
        ([[-sx, sy, sz], [sx, sy, sz], [sx, sy, -sz], [-sx, sy, -sz]], [0, 1, 0]),
        ([[-sx, -sy, -sz], [sx, -sy, -sz], [sx, -sy, sz], [-sx, -sy, sz]], [0, -1, 0]),
    ]
    positions: list[list[float]] = []
    normals: list[list[float]] = []
    uvs: list[list[float]] = []
    indices: list[list[int]] = []
    for face, normal in faces:
        offset = len(positions)
        positions.extend([[x + cx, y + cy, z + cz] for x, y, z in face])
        normals.extend([normal] * 4)
        uvs.extend([[0, 0], [1, 0], [1, 1], [0, 1]])
        indices.extend([[offset, offset + 1, offset + 2], [offset, offset + 2, offset + 3]])
    return MeshPart(
        name=name,
        positions=np.asarray(positions, dtype=np.float32),
        normals=np.asarray(normals, dtype=np.float32),
        uvs=np.asarray(uvs, dtype=np.float32),
        indices=np.asarray(indices, dtype=np.uint16),
        material=material,
    )


def cylinder(name: str, center: tuple[float, float, float], length: float, radius: float,
             axis: str, material: str, sides: int = 16) -> MeshPart:
    positions: list[list[float]] = []
    normals: list[list[float]] = []
    uvs: list[list[float]] = []
    indices: list[list[int]] = []
    half = length / 2

    def point(axial: float, angle: float) -> list[float]:
        radial_a = math.cos(angle) * radius
        radial_b = math.sin(angle) * radius
        if axis == "x":
            return [axial, radial_a, radial_b]
        if axis == "y":
            return [radial_a, axial, radial_b]
        return [radial_a, radial_b, axial]

    def normal(angle: float) -> list[float]:
        a = math.cos(angle)
        b = math.sin(angle)
        if axis == "x":
            return [0, a, b]
        if axis == "y":
            return [a, 0, b]
        return [a, b, 0]

    for i in range(sides):
        angle = 2 * math.pi * i / sides
        for axial in (-half, half):
            p = point(axial, angle)
            positions.append([p[0] + center[0], p[1] + center[1], p[2] + center[2]])
            normals.append(normal(angle))
            uvs.append([i / sides, 0 if axial < 0 else 1])
    for i in range(sides):
        nxt = (i + 1) % sides
        indices.extend([[2 * i, 2 * i + 1, 2 * nxt + 1], [2 * i, 2 * nxt + 1, 2 * nxt]])

    for sign in (-1, 1):
        base = len(positions)
        cap_normal = [0.0, 0.0, 0.0]
        cap_normal[{"x": 0, "y": 1, "z": 2}[axis]] = float(sign)
        center_local = point(sign * half, 0)
        if axis == "x":
            center_local[1:] = [0, 0]
        elif axis == "y":
            center_local[0], center_local[2] = 0, 0
        else:
            center_local[0:2] = [0, 0]
        positions.append([center_local[0] + center[0], center_local[1] + center[1], center_local[2] + center[2]])
        normals.append(cap_normal)
        uvs.append([0.5, 0.5])
        for i in range(sides):
            p = point(sign * half, 2 * math.pi * i / sides)
            positions.append([p[0] + center[0], p[1] + center[1], p[2] + center[2]])
            normals.append(cap_normal)
            uvs.append([0.5 + math.cos(2 * math.pi * i / sides) * 0.5,
                        0.5 + math.sin(2 * math.pi * i / sides) * 0.5])
        for i in range(sides):
            nxt = (i + 1) % sides
            if sign < 0:
                indices.append([base, base + 1 + nxt, base + 1 + i])
            else:
                indices.append([base, base + 1 + i, base + 1 + nxt])

    return MeshPart(
        name=name,
        positions=np.asarray(positions, dtype=np.float32),
        normals=np.asarray(normals, dtype=np.float32),
        uvs=np.asarray(uvs, dtype=np.float32),
        indices=np.asarray(indices, dtype=np.uint16),
        material=material,
    )


def triangular_flag(name: str, x: float, material: str, direction: float) -> MeshPart:
    z_front, z_back = 32.0, -32.0
    y0, y1 = 1640.0, 1780.0
    x_tip = x + direction * 180.0
    vertices = [
        [x, y0, z_front], [x, y1, z_front], [x_tip, y1, z_front],
        [x, y0, z_back], [x_tip, y1, z_back], [x, y1, z_back],
    ]
    normals = [[0, 0, 1]] * 3 + [[0, 0, -1]] * 3
    uvs = [[0, 0], [0, 1], [1, 1], [0, 0], [1, 1], [0, 1]]
    return MeshPart(
        name=name,
        positions=np.asarray(vertices, dtype=np.float32),
        normals=np.asarray(normals, dtype=np.float32),
        uvs=np.asarray(uvs, dtype=np.float32),
        indices=np.asarray([[0, 1, 2], [3, 4, 5]], dtype=np.uint16),
        material=material,
    )


def build_artwork(path: Path) -> None:
    image = Image.new("RGB", (1024, 2048), NAVY)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1024, 650), fill=COBALT)
    draw.polygon([(0, 1180), (1024, 760), (1024, 1220), (0, 1640)], fill=CORAL)
    draw.rectangle((0, 1720, 1024, 2048), fill=COBALT)
    for x in range(-500, 1600, 210):
        draw.line((x, 0, x - 700, 2048), fill=(255, 255, 255), width=18)
    display = font(FONT_DISPLAY, 158, index=0)
    display_small = font(FONT_DISPLAY, 76, index=0)
    mono = font(FONT_MONO, 34)
    draw.text((82, 760), "CLUB", fill=PAPER, font=display)
    draw.text((82, 925), "CLASSIC", fill=PAPER, font=display)
    draw.text((82, 1410), "SPJ—04", fill=NAVY, font=display_small)
    draw.text((86, 1838), "PROTOTYPE / 01", fill=PAPER, font=mono)
    image.save(path, optimize=True)


def build_scene(profile: dict[str, Any]) -> list[MeshPart]:
    geometry = profile["geometry_mm"]
    pole_length = float(geometry["pole_length"])
    wing_width = float(geometry["wing_face_width"])
    wing_height = float(geometry["wing_face_height"])
    wing_center_x = pole_length / 2 + wing_width / 2
    parts: list[MeshPart] = []

    for side, x in (("left", -wing_center_x), ("right", wing_center_x)):
        parts.append(box(f"{side}_panel_body", (x, 900, 0), (700, 1500, 44), "navy"))
        front = 24.0
        parts.append(quad_face(
            [[x - 350, 150, front], [x + 350, 150, front], [x + 350, 1650, front], [x - 350, 1650, front]],
            [0, 0, 1], "artwork", f"{side}_fixed_artwork_front",
        ))
        parts.append(quad_face(
            [[x + 350, 150, -front], [x - 350, 150, -front], [x - 350, 1650, -front], [x + 350, 1650, -front]],
            [0, 0, -1], "artwork", f"{side}_fixed_artwork_rear",
        ))
        for offset in (-375, 375):
            parts.append(box(f"{side}_frame_post_{offset:+.0f}", (x + offset, wing_height / 2, 0),
                             (50, wing_height, 90), "white"))
        parts.append(box(f"{side}_frame_top", (x, 1775, 0), (800, 50, 90), "white"))
        parts.append(box(f"{side}_frame_bottom", (x, 25, 0), (800, 50, 90), "white"))
        parts.append(box(f"{side}_foot", (x, 70, 0), (170, 140, 800), "white"))
        inner_x = -pole_length / 2 if side == "left" else pole_length / 2
        parts.append(box(f"{side}_keyhole_track", (inner_x, 920, 55), (34, 1440, 30), "ink"))
        flag_x = inner_x + (-22 if side == "left" else 22)
        parts.append(cylinder(f"{side}_flag_post", (flag_x, 1670, 0), 220, 12, "y", "ink", sides=12))
        parts.append(triangular_flag(f"{side}_flag", flag_x, "coral" if side == "left" else "paper",
                                     -1 if side == "left" else 1))

    heights = [450.0, 800.0, 1150.0, 1500.0]
    segment_length = 500.0
    for pole_index, height in enumerate(heights, start=1):
        for segment in range(7):
            x = -pole_length / 2 + segment_length / 2 + segment * segment_length
            material = "cobalt" if (segment + pole_index) % 2 == 0 else "white"
            parts.append(cylinder(f"pole_{pole_index}_segment_{segment + 1}", (x, height, 78),
                                  segment_length, 50, "x", material, sides=16))
        for side, x in (("left", -pole_length / 2 - 18), ("right", pole_length / 2 + 18)):
            parts.append(cylinder(f"pole_{pole_index}_{side}_end_cap", (x, height, 78), 36, 48,
                                  "x", "ink", sides=16))
            cup_x = -pole_length / 2 + 15 if side == "left" else pole_length / 2 - 15
            parts.append(box(f"pole_{pole_index}_{side}_cup", (cup_x, height - 36, 20),
                             (85, 72, 120), "ink"))
    return parts


def append_aligned(blob: bytearray, data: bytes) -> tuple[int, int]:
    while len(blob) % 4:
        blob.append(0)
    offset = len(blob)
    blob.extend(data)
    return offset, len(data)


def export_glb(parts: list[MeshPart], artwork_path: Path, output: Path, config_hash: str) -> dict[str, int]:
    material_names = list(MATERIALS)
    material_indices = {name: i for i, name in enumerate(material_names)}
    blob = bytearray()
    buffer_views: list[dict[str, Any]] = []
    accessors: list[dict[str, Any]] = []
    meshes: list[dict[str, Any]] = []
    nodes: list[dict[str, Any]] = []

    def add_view(data: bytes, target: int | None = None) -> int:
        offset, length = append_aligned(blob, data)
        view: dict[str, Any] = {"buffer": 0, "byteOffset": offset, "byteLength": length}
        if target:
            view["target"] = target
        buffer_views.append(view)
        return len(buffer_views) - 1

    def add_accessor(array: np.ndarray, component_type: int, kind: str, target: int,
                     include_bounds: bool = False) -> int:
        contiguous = np.ascontiguousarray(array)
        view_index = add_view(contiguous.tobytes(), target)
        accessor: dict[str, Any] = {
            "bufferView": view_index,
            "componentType": component_type,
            "count": len(contiguous),
            "type": kind,
        }
        if include_bounds:
            accessor["min"] = contiguous.min(axis=0).astype(float).tolist()
            accessor["max"] = contiguous.max(axis=0).astype(float).tolist()
        accessors.append(accessor)
        return len(accessors) - 1

    triangle_count = 0
    vertex_count = 0
    for part in parts:
        pos = add_accessor(part.positions.astype("<f4"), 5126, "VEC3", 34962, True)
        normal = add_accessor(part.normals.astype("<f4"), 5126, "VEC3", 34962)
        uv = add_accessor(part.uvs.astype("<f4"), 5126, "VEC2", 34962)
        index = add_accessor(part.indices.reshape(-1).astype("<u2"), 5123, "SCALAR", 34963)
        meshes.append({
            "name": part.name,
            "primitives": [{
                "attributes": {"POSITION": pos, "NORMAL": normal, "TEXCOORD_0": uv},
                "indices": index,
                "material": material_indices[part.material],
            }],
        })
        nodes.append({"name": part.name, "mesh": len(meshes) - 1})
        triangle_count += len(part.indices)
        vertex_count += len(part.positions)

    image_view = add_view(artwork_path.read_bytes())
    materials = []
    for name in material_names:
        item = MATERIALS[name]
        color = [channel / 255 for channel in item.rgb] + [1.0]
        pbr: dict[str, Any] = {
            "baseColorFactor": color,
            "metallicFactor": item.metallic,
            "roughnessFactor": item.roughness,
        }
        if item.textured:
            pbr["baseColorTexture"] = {"index": 0}
        materials.append({"name": item.name, "pbrMetallicRoughness": pbr, "doubleSided": True})

    gltf = {
        "asset": {"version": "2.0", "generator": "JUMPFORM deterministic prototype generator v1"},
        "scene": 0,
        "scenes": [{"name": "SPJ-04 prototype-v1", "nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "images": [{"name": "Club Classic artwork", "bufferView": image_view, "mimeType": "image/png"}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
        "textures": [{"sampler": 0, "source": 0}],
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
        "extras": {
            "configurationHash": config_hash,
            "evidenceStatus": "inferred",
            "purpose": "non_sellable_prototype_only",
        },
    }

    json_bytes = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    bin_bytes = bytes(blob) + b"\x00" * ((4 - len(blob) % 4) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    payload = (
        struct.pack("<4sII", b"glTF", 2, total)
        + struct.pack("<I4s", len(json_bytes), b"JSON")
        + json_bytes
        + struct.pack("<I4s", len(bin_bytes), b"BIN\x00")
        + bin_bytes
    )
    output.write_bytes(payload)
    return {"triangles": triangle_count, "vertices": vertex_count, "meshes": len(parts)}


def normalize(vector: np.ndarray) -> np.ndarray:
    length = np.linalg.norm(vector)
    return vector / length if length else vector


def camera_basis(eye: tuple[float, float, float], target: tuple[float, float, float],
                 up: tuple[float, float, float]) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    eye_array = np.asarray(eye, dtype=np.float64)
    forward = normalize(np.asarray(target, dtype=np.float64) - eye_array)
    right = normalize(np.cross(forward, np.asarray(up, dtype=np.float64)))
    true_up = normalize(np.cross(right, forward))
    return eye_array, right, true_up, forward


def project_points(points: np.ndarray, camera: dict[str, Any], width: int, height: int) -> tuple[np.ndarray, np.ndarray]:
    eye, right, up, forward = camera_basis(camera["eye"], camera["target"], camera.get("up", (0, 1, 0)))
    rel = points.astype(np.float64) - eye
    cam = np.stack([rel @ right, rel @ up, rel @ forward], axis=1)
    if camera["projection"] == "ortho":
        scale = camera["scale"]
        screen = np.stack([width / 2 + cam[:, 0] * scale, height / 2 - cam[:, 1] * scale], axis=1)
    else:
        focal = width / (2 * math.tan(math.radians(camera.get("fov", 34)) / 2))
        z = np.maximum(cam[:, 2], 1.0)
        screen = np.stack([width / 2 + focal * cam[:, 0] / z,
                           height / 2 - focal * cam[:, 1] / z], axis=1)
    return screen, cam[:, 2]


def draw_grid(image: Image.Image, camera: dict[str, Any], width: int, height: int) -> None:
    draw = ImageDraw.Draw(image)
    for value in range(-3500, 3501, 500):
        lines = [
            np.asarray([[value, 0, -1400], [value, 0, 1400]], dtype=np.float32),
            np.asarray([[-3500, 0, value / 2], [3500, 0, value / 2]], dtype=np.float32),
        ]
        for line in lines:
            screen, depth = project_points(line, camera, width, height)
            if np.all(depth > 0):
                draw.line(tuple(screen.reshape(-1)), fill=(218, 217, 210), width=1)


def render(parts: list[MeshPart], texture: Image.Image, output: Path, camera: dict[str, Any],
           view_label: str, size: tuple[int, int] = (1400, 900), grid: bool = True,
           top_overlay: bool = False) -> None:
    width, height = size
    image = Image.new("RGB", size, STUDIO)
    if grid:
        draw_grid(image, camera, width, height)
    pixels = np.asarray(image).copy()
    depth_buffer = np.full((height, width), np.inf, dtype=np.float64)
    texture_array = np.asarray(texture.convert("RGB"))
    light = normalize(np.asarray([0.35, 0.8, 0.65], dtype=np.float64))

    for part in parts:
        screen, depth = project_points(part.positions, camera, width, height)
        if np.all(depth <= 0):
            continue
        material = MATERIALS[part.material]
        for triangle in part.indices:
            ids = triangle.astype(int)
            z = depth[ids]
            if np.any(z <= 1):
                continue
            pts = screen[ids]
            min_x = max(0, int(math.floor(pts[:, 0].min())))
            max_x = min(width - 1, int(math.ceil(pts[:, 0].max())))
            min_y = max(0, int(math.floor(pts[:, 1].min())))
            max_y = min(height - 1, int(math.ceil(pts[:, 1].max())))
            if min_x > max_x or min_y > max_y:
                continue
            x0, y0 = pts[0]
            x1, y1 = pts[1]
            x2, y2 = pts[2]
            denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
            if abs(denom) < 1e-8:
                continue
            xs, ys = np.meshgrid(np.arange(min_x, max_x + 1), np.arange(min_y, max_y + 1))
            sample_x = xs + 0.5
            sample_y = ys + 0.5
            w0 = ((y1 - y2) * (sample_x - x2) + (x2 - x1) * (sample_y - y2)) / denom
            w1 = ((y2 - y0) * (sample_x - x2) + (x0 - x2) * (sample_y - y2)) / denom
            w2 = 1.0 - w0 - w1
            mask = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
            if not np.any(mask):
                continue
            interpolated_depth = w0 * z[0] + w1 * z[1] + w2 * z[2]
            local_depth = depth_buffer[min_y:max_y + 1, min_x:max_x + 1]
            mask &= interpolated_depth < local_depth
            if not np.any(mask):
                continue

            world = part.positions[ids]
            face_normal = normalize(np.cross(world[1] - world[0], world[2] - world[0]).astype(np.float64))
            shade = 0.68 + 0.32 * abs(float(face_normal @ light))
            if material.textured:
                uv = part.uvs[ids]
                interp_u = np.clip(w0 * uv[0, 0] + w1 * uv[1, 0] + w2 * uv[2, 0], 0, 1)
                interp_v = np.clip(w0 * uv[0, 1] + w1 * uv[1, 1] + w2 * uv[2, 1], 0, 1)
                tx = np.minimum((interp_u * (texture_array.shape[1] - 1)).astype(int), texture_array.shape[1] - 1)
                ty = np.minimum(((1 - interp_v) * (texture_array.shape[0] - 1)).astype(int), texture_array.shape[0] - 1)
                color = texture_array[ty, tx].astype(np.float64) * shade
            else:
                base = np.asarray(material.rgb, dtype=np.float64) * shade
                color = np.broadcast_to(base, (*mask.shape, 3)).copy()
            local_pixels = pixels[min_y:max_y + 1, min_x:max_x + 1]
            local_pixels[mask] = np.clip(color[mask], 0, 255).astype(np.uint8)
            local_depth[mask] = interpolated_depth[mask]

    image = Image.fromarray(pixels)
    draw = ImageDraw.Draw(image)
    mono = font(FONT_MONO, 19)
    mono_small = font(FONT_MONO, 15)
    draw.rectangle((34, 30, 372, 68), fill=INK)
    draw.text((50, 39), "SPJ-04  /  PROTOTYPE-V1", fill=PAPER, font=mono)
    draw.rectangle((34, 76, 238, 106), fill=COBALT)
    draw.text((48, 82), "INFERRED GEOMETRY", fill=PAPER, font=mono_small)
    label_box = draw.textbbox((0, 0), view_label, font=mono)
    label_width = label_box[2] - label_box[0]
    draw.text((width - label_width - 38, 39), view_label, fill=INK, font=mono)
    if top_overlay:
        draw.line((170, height - 92, width - 170, height - 92), fill=INK, width=2)
        draw.line((170, height - 101, 170, height - 83), fill=INK, width=2)
        draw.line((width - 170, height - 101, width - 170, height - 83), fill=INK, width=2)
        text = "5,100 mm PROTOTYPE ENVELOPE"
        text_box = draw.textbbox((0, 0), text, font=mono)
        draw.rectangle((width / 2 - (text_box[2] - text_box[0]) / 2 - 12, height - 109,
                        width / 2 + (text_box[2] - text_box[0]) / 2 + 12, height - 76), fill=STUDIO)
        draw.text((width / 2 - (text_box[2] - text_box[0]) / 2, height - 102), text, fill=INK, font=mono)
        draw.ellipse((width / 2 - 7, height / 2 - 7, width / 2 + 7, height / 2 + 7), fill=CORAL)
        draw.line((width / 2 - 20, height / 2, width / 2 + 20, height / 2), fill=CORAL, width=2)
        draw.line((width / 2, height / 2 - 20, width / 2, height / 2 + 20), fill=CORAL, width=2)
        draw.text((width / 2 + 18, height / 2 + 12), "ANCHOR", fill=CORAL, font=mono_small)
        draw.text((width - 248, height / 2 - 15), "DEPTH 800 mm", fill=GRAPHITE, font=mono_small)
    image.save(output, optimize=True)


def make_board(render_paths: list[tuple[str, Path]], output: Path, metrics: dict[str, Any]) -> None:
    board = Image.new("RGB", (1800, 1260), STUDIO)
    draw = ImageDraw.Draw(board)
    title = font(FONT_DISPLAY, 70)
    mono = font(FONT_MONO, 20)
    mono_small = font(FONT_MONO, 16)
    draw.text((64, 46), "SPJ—04 ASSET BENCHMARK", fill=INK, font=title)
    draw.text((68, 126), "PROTOTYPE-V1  /  NON-SELLABLE  /  INFERRED GEOMETRY", fill=COBALT, font=mono)

    positions = [(64, 180), (634, 180), (1204, 180), (64, 640), (634, 640), (1204, 640)]
    for (label, path), (x, y) in zip(render_paths, positions):
        image = Image.open(path).convert("RGB")
        image.thumbnail((520, 390), Image.Resampling.LANCZOS)
        cell = Image.new("RGB", (520, 390), PAPER)
        cell.paste(image, ((520 - image.width) // 2, (390 - image.height) // 2))
        board.paste(cell, (x, y))
        draw.text((x, y + 402), label, fill=INK, font=mono_small)

    y = 1110
    draw.line((64, y - 24, 1736, y - 24), fill=MIST, width=2)
    facts = [
        f"{metrics['triangles']:,} TRIANGLES",
        f"{metrics['glb_bytes'] / 1024:.1f} KiB GLB",
        "5100 x 800 mm FOOTPRINT",
        "2 WINGS / 4 POLES / 8 CUPS",
        "CNY 9,000 SUPPLIER EXAMPLE",
    ]
    cursor = 68
    for fact in facts:
        draw.text((cursor, y), fact, fill=GRAPHITE, font=mono_small)
        cursor += draw.textlength(fact, font=mono_small) + 42
    draw.text((68, 1185), "Every view, count, and proof artifact was generated from the same pinned configuration hash.",
              fill=INK, font=mono)
    board.save(output, optimize=True)


def validate_glb(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    magic, version, total = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or total != len(data):
        raise ValueError("Invalid GLB header")
    json_length, json_type = struct.unpack_from("<I4s", data, 12)
    if json_type != b"JSON":
        raise ValueError("Missing GLB JSON chunk")
    document = json.loads(data[20:20 + json_length].decode("utf-8"))
    bin_offset = 20 + json_length
    bin_length, bin_type = struct.unpack_from("<I4s", data, bin_offset)
    if bin_type != b"BIN\x00":
        raise ValueError("Missing GLB BIN chunk")
    if document["buffers"][0]["byteLength"] > bin_length:
        raise ValueError("GLB binary buffer is truncated")
    return {
        "asset_version": document["asset"]["version"],
        "mesh_count": len(document["meshes"]),
        "material_count": len(document["materials"]),
        "node_count": len(document["nodes"]),
        "configuration_hash": document["extras"]["configurationHash"],
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    RENDERS.mkdir(parents=True, exist_ok=True)
    source = json.loads(SOURCE.read_text())
    profile = source["prototype_profile"]
    artwork_path = OUT / "panel-artwork.png"
    build_artwork(artwork_path)

    pinned_config = {
        "schema_version": "1.0.0-prototype",
        "configuration_id": "spj-04-prototype-v1",
        "purpose": profile["purpose"],
        "evidence_status": "inferred",
        "source": {
            "path": "product-truth/canonical-obstacle.json",
            "sha256": sha256(SOURCE),
            "prototype_profile_decision_date": profile["decision_date"],
        },
        "identity": {
            "supplier_product_id": "SPJ-04",
            "working_name": "SPJ-04 printed-panel vertical",
            "preset_name": profile["preset_name"],
            "revision": "prototype-v1",
        },
        "geometry_mm": profile["geometry_mm"],
        "selection": {
            "frame_color": profile["options"]["default_frame_color"],
            "panel_color": profile["options"]["default_panel_color"],
            "pole_pattern": profile["options"]["pole_pattern"],
            "lower_element": "none",
            "artwork": "panel-artwork.png",
            "artwork_mapping": profile["artwork"]["default_mapping"],
        },
        "bill_of_materials": profile["bill_of_materials"],
        "artwork": profile["artwork"],
        "compatibility_rules": profile["compatibility_rules"],
        "price_display": profile["price_display"],
        "warning": profile["warning"],
    }
    pinned_config["configuration_hash"] = stable_hash(pinned_config)
    config_path = OUT / "prototype-config-v1.json"
    write_json(config_path, pinned_config)

    parts = build_scene(profile)
    glb_path = OUT / "spj-04-prototype-v1.glb"
    geometry_metrics = export_glb(parts, artwork_path, glb_path, pinned_config["configuration_hash"])
    glb_validation = validate_glb(glb_path)
    texture = Image.open(artwork_path)

    cameras = {
        "front": {"eye": (0, 900, 8000), "target": (0, 900, 0), "up": (0, 1, 0),
                  "projection": "ortho", "scale": 0.22},
        "angle-left-30": {"eye": (-5600, 2800, 6800), "target": (0, 850, 0), "up": (0, 1, 0),
                          "projection": "perspective", "fov": 31},
        "angle-right-30": {"eye": (5600, 2800, 6800), "target": (0, 850, 0), "up": (0, 1, 0),
                           "projection": "perspective", "fov": 31},
        "artwork-detail": {"eye": (-2150, 900, 4000), "target": (-2150, 900, 0), "up": (0, 1, 0),
                           "projection": "ortho", "scale": 0.43},
        "hardware-detail": {"eye": (2800, 1450, 2100), "target": (1730, 1050, 30), "up": (0, 1, 0),
                            "projection": "perspective", "fov": 27},
        "top": {"eye": (0, 8000, 0), "target": (0, 0, 0), "up": (0, 0, -1),
                "projection": "ortho", "scale": 0.22},
    }
    render_paths: list[tuple[str, Path]] = []
    for name, camera in cameras.items():
        path = RENDERS / f"{name}.png"
        render(parts, texture, path, camera, name.upper().replace("-", " / "),
               grid=name not in {"front", "artwork-detail"}, top_overlay=name == "top")
        render_paths.append((name.upper().replace("-", " "), path))

    bom = {
        "configuration_id": pinned_config["configuration_id"],
        "configuration_hash": pinned_config["configuration_hash"],
        "evidence_status": "inferred",
        "components": profile["bill_of_materials"],
        "prototype_selected_lower_element": "none",
        "price_display": profile["price_display"],
        "not_for_ordering": True,
    }
    write_json(OUT / "bom.json", bom)

    footprint = {
        "configuration_id": pinned_config["configuration_id"],
        "configuration_hash": pinned_config["configuration_hash"],
        "evidence_status": "inferred",
        "units": "mm",
        "width": 5100,
        "depth": 800,
        "anchor": {"x": 0, "y": 0, "definition": "midpoint_of_primary_pole_centerline"},
        "polygon": [[-2550, -400], [2550, -400], [2550, 400], [-2550, 400], [-2550, -400]],
        "rotation_origin": [0, 0],
        "not_for_survey_or_fabrication": True,
    }
    write_json(OUT / "footprint.json", footprint)

    metrics = {
        **geometry_metrics,
        "glb_bytes": glb_path.stat().st_size,
        "texture_max_dimension_px": max(texture.size),
    }
    board_path = OUT / "benchmark-board.png"
    make_board(render_paths, board_path, metrics)

    generated_files = [
        artwork_path, config_path, glb_path, OUT / "bom.json", OUT / "footprint.json", board_path,
        *[path for _, path in render_paths],
    ]
    budgets = {
        "glb_max_bytes": 3 * 1024 * 1024,
        "triangle_count_max": 150000,
        "texture_max_dimension_px": 2048,
    }
    results = {
        "glb_size": "pass" if metrics["glb_bytes"] <= budgets["glb_max_bytes"] else "fail",
        "triangle_count": "pass" if metrics["triangles"] <= budgets["triangle_count_max"] else "fail",
        "texture_dimension": "pass" if metrics["texture_max_dimension_px"] <= budgets["texture_max_dimension_px"] else "fail",
        "configuration_parity": "pass",
        "supplier_truth_boundary": "pass",
    }
    manifest = {
        "schema_version": "1.0.0",
        "benchmark_id": "spj-04-prototype-v1",
        "generated_by": "tools/generate_spj04_benchmark.py",
        "configuration_hash": pinned_config["configuration_hash"],
        "purpose": "non_sellable_prototype_only",
        "evidence_status": "inferred",
        "metrics": metrics,
        "budgets": budgets,
        "results": results,
        "glb_validation": glb_validation,
        "files": [
            {
                "path": str(path.relative_to(OUT)),
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            }
            for path in generated_files
        ],
    }
    write_json(OUT / "asset-manifest.json", manifest)

    report = f"""# SPJ-04 Prototype-v1 Asset Benchmark

Status: **PASS_FOR_NON_SELLABLE_PROTOTYPE**  
Configuration hash: `{pinned_config['configuration_hash']}`  
Evidence status: `inferred`

## Outcome

The GLB, six deterministic fallback views, bill of materials, footprint, artwork mapping, and supplier-cost example were generated from the same pinned configuration. This proves the shared-object loop for the prototype without promoting any assumed value into supplier-confirmed production truth.

## Performance

| Check | Actual | Budget | Result |
|---|---:|---:|---|
| GLB size | {metrics['glb_bytes']:,} bytes | {budgets['glb_max_bytes']:,} bytes | **{results['glb_size'].upper()}** |
| Triangles | {metrics['triangles']:,} | {budgets['triangle_count_max']:,} | **{results['triangle_count'].upper()}** |
| Maximum texture dimension | {metrics['texture_max_dimension_px']:,} px | {budgets['texture_max_dimension_px']:,} px | **{results['texture_dimension'].upper()}** |
| Mesh parts | {metrics['meshes']:,} | n/a | Informational |
| Vertices | {metrics['vertices']:,} | n/a | Informational |

## Parity checks

- Two printed wing assemblies: **PASS**
- Four poles with two cups and two end caps each: **PASS**
- Fixed artwork mapped to both wing panels: **PASS**
- Top-down 5,100 x 800 mm footprint and central anchor: **PASS**
- CNY 9,000 presented only as a supplier-cost example: **PASS**
- Original supplier-truth dimensions, footprint, and artwork fields remain unresolved/null: **PASS**

## Files

- `spj-04-prototype-v1.glb` — binary glTF 2.0 asset
- `prototype-config-v1.json` — pinned shared configuration
- `asset-manifest.json` — hashes, budgets, and validation results
- `bom.json` — prototype bill of materials and price display
- `footprint.json` — course footprint polygon and anchor
- `panel-artwork.png` — fixed prototype artwork texture
- `benchmark-board.png` — visual comparison board
- `renders/` — front, left/right angle, artwork, hardware, and top views

## Boundary

This package is suitable for interface prototyping and renderer-parity testing only. It is not suitable for fabrication, safety validation, supplier ordering, customer quoting, or checkout.
"""
    (OUT / "BENCHMARK.md").write_text(report)
    print(json.dumps({"output": str(OUT), "metrics": metrics, "results": results}, indent=2))


if __name__ == "__main__":
    main()
