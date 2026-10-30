# 0012. The Ground a Robot Learns, and Every Field at a Point

- **Status:** Accepted, provisionally (the Moon's ground; the ocean's water with the fish, and the Earth's ground with the dog, 2026-10-31). Amends [0011](0011-a-rabbit-on-the-moon.md) (the rabbit's ground) and the POINT page of [0006](0006-the-world-first-and-the-field-about-a-point.md).
- **Date:** 2026-10-30
- **Decided by:** the user, who asked that a simulated world presume the physical properties of a place, read as a virtual sensor, with real sensors' data taking their place when they attach; that a robot and its environment make fields together; and for "a panel [that] can show all dimensions of the physical fields' values of a selected point". Claude designed the answer, on the infrastructure's [ADR 0059](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0059-robots-in-their-environments.md).

## 1. Context

The world's fields could be read on samplings and in a cube (decisions 0006, 0007), but no page showed every field at one point. The rabbit stood on one contact law everywhere.

## 2. Decision

### 2.1 Every Field at a Point

The engine's `field.at` reads every field of the world at one event, an address, at an instant (the mission clock's when none is named). Each field is read where the event is in its own frame. Each answer gives:
- its value: a scalar with its unit, or a vector in its frame and on the local east, north and up of the body the event is on, with its length;
- its provenance and its source;
- or, where it has none, its quality and reason; a field whose model is not loaded says so.

The POINT page shows them under *The fields here*, a row each, teslas in nanotesla.

### 2.2 The Moon's Ground as Fields

The world holds the Moon's ground as the planetary-science domain gives it:
- `moon.ground.friction`, `moon.ground.load` and `moon.ground.damping`: the regolith realised with the world's seed (synthetic);
- each with its `.presumed`: the law's median (model), its source naming what it rests on.

### 2.3 A Robot on That Ground

On the Moon the robot's feet press on the same realisation, along its line, so that what POINT reads at a place is what a foot there meets. The robot is told the presumption (a virtual instrument's reading of the world's model) and learns from its feet. The engine's answers carry:
- the presumption;
- the belief at its toe and along its line;
- its feet's readings since an index;
- the whitened mean square of its readings;
- the truth only when asked to reveal it, as the rover's mission does.

The ROBOT page shows *Its ground*: a table of what it was told, believes and (revealed) is, and the friction along its line in a figure that separates. The colours are the provenances': told in the model's blue, read in the observation's rose, believed in the assimilation's amber, with its band of one deviation; the truth is dotted. In the world, the feet's readings are rose marks on the strip where they were taken: what the robot and its ground made together, kept where it was made.

### 2.4 The Fish in the Ocean (2026-10-31)

The world also holds the upper ocean's water as the oceanography domain gives it: `earth.ocean.density` and `earth.ocean.current`, each with its `.presumed`. The robotics domain's fish is a second kind of robot session (`"model": "fish"`). It swims at a depth below the sea's surface, in its horizontal plane along the azimuth. Away from the sea it is refused with CRUST1.0's depth of water at the place. Its water is the world's at the site: the realised density and current, the current on its plane's axes. It is told the presumption, which has no current, and the current carries it.

The ROBOT page chooses the robot: the rabbit with its Moon's sites, or the fish with sites at sea (the equatorial Pacific, the North Atlantic) or the point chosen. For the fish it shows:
- its plane from above: its links, each servo's torque against its peak, its head's path, its wake (where its tail pushed the water, fading over two seconds), and the current when revealed;
- its body (speed against the one asked, its beat and whether it is at its fastest, its heading, the distance swum), its servos, its water told and true, its energy and the method's cost;
- the speed of its head over time.

In the world it is drawn 1 m below the sea's surface as the world draws it, the geoid's surface. It is seen through that surface, which hides what is beneath; a disc marks the surface about it, and its wake is drawn in rose.

### 2.5 The Dog on the Earth's Ground (2026-10-31)

The world holds the land's ground as the geophysics domain gives it: `earth.ground.friction`, `.load` and `.damping`, each with its `.presumed`, by CRUST1.0's class at the place (ice, sediment, rock); at sea refused. The robotics domain's dog is a third kind of robot session (`"model": "dog"`). It trots in its sagittal plane along the azimuth on that ground, at the Earth's normal gravity at the site, and is refused at sea. It is told the presumption of its place's class and learns its ground from its feet, as the rabbit does.

The ROBOT page has its sites, the Greenland ice sheet and Paris on sediment, or the point chosen. It shows:
- the dog from its right side, its left legs paler behind, each motor's torque, the ground's force at each foot and its feet in stance;
- its body, motors and feet;
- its ground told, believed and (revealed) true.

In the world it stands at its site at true scale, its legs on their sides.

## 3. Alternatives Considered

- **A separate page for the fields at a point.** Rejected: the point chosen is POINT's; its fields belong under its place.
- **The truth in every answer, hidden by the page.** Rejected: hidden means not sent, as for the rover.
- **The ground for the robot from its own seed.** Rejected: the robot stands on the world's ground, the same seed, so a reading of POINT and a step of a foot agree.

## 4. Consequences

- The engine answers `field.at`, and its fields gain the six of the Moon's ground.
- The checks gain `field.at` on the Greenland ice sheet, and the robot's ground on the Moon: told the presumption, reading both parameters, its belief within three deviations of the truth, its readings calibrated, the truth hidden unless revealed, and its ground the world's field at the site.
- The engine's fields gain the four of the ocean's water; the checks, the fish's session.
- The engine's fields gain the six of the land's ground; the checks, the dog's session on ice and on sediment and its refusal at sea.
