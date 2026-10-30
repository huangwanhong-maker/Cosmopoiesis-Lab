# 0011. A Rabbit on the Moon: a Body with Joints in the World

- **Status:** Accepted, provisionally (seen in headless Chrome by night, at Reiner Gamma: the side view hopping, the rabbit in the world at true scale, followed by the camera). One robot, in its plane, on a level ground at the terrain's height.
- **Date:** 2026-10-30
- **Decided by:** the user, who asked for physical robots that could be built, visualized on the console, moved by "many methods, like action S based", and doing example behaviours; and who chose a rabbit for the Moon. Claude designed the answer, on the infrastructure's [ADR 0058](https://github.com/huangwanhong-maker/The-Science-Infrastructures/blob/main/development/decisions/0058-a-body-with-joints.md).

## 1. Context

The world held one body that moves of its own accord, the rover of decision 0008: a point with a heading, rolling. The robotics domain now holds a body with joints, the rabbit, its controller and three methods of its motion (`legged`). The world should show it where it is, at its true size, and let one ask it to do things and watch what each method makes of the same motion.

## 2. Decision

### 2.1 The Robot in the Engine (`engine/robot.hpp`)

A robot is a session of the serving engine, kept as missions are:
- `robot.models`: the catalogue, each link with its parent, joint, mass, inertia, armature and shape; each motor with its peak, no-load speed, torque constant and resistance; the feet, the tendon and the ground's law;
- `robot.start` with a site (a body, a latitude and longitude, an azimuth) and a method;
- `robot.command`: stand, hop (a speed and an apex) or stop, answered with the reason when the body cannot do it;
- `robot.step`: the robot's time advanced, its frames since the last the page read (the links' poses at 60 Hz of its time), and its state: phase, hops, apex, speed, pitch, its joints' torques against their peaks and their electrical power, its feet's forces, the energy's account, the method's cost;
- `robot.state`, `robot.stop`, and `robot.run`, a session run whole for the checks.

The robot moves in its plane, the vertical plane through the site along the azimuth. Its gravity is the body's there: DE440's GM over the Moon's radius squared, or WGS 84's normal gravity at the latitude (the geodesy domain's).

### 2.2 The Page ROBOT

On the science deck, beside ROVER:
- **The side view**, a figure that separates (decision 0009). It shows the robot's plane from its right side, the camera on its centre, the ground ticked from the start. The links are drawn as their shapes. Each motor's torque is an arc about its joint, its sweep the torque's share of the peak, amber at the peak. The ground's force at each foot is an arrow, and the centre's path over three seconds is a dotted line. The apex asked is drawn when hopping.
- **Keys**: the site (Reiner Gamma, Apollo 16, or the point chosen on the Moon or the Earth), the heading, the method (the action's variational integrator, semi-implicit Euler, Runge–Kutta), Run and Hold, a rate (×¼, ×½, ×1); the behaviours with the speed and apex asked. A refusal is shown as a caution lamp with its reason, not a pop-up.
- **Readings**: the body (time, phase, hops, apex against the one asked, speed, pitch, distance, thrust); its motors' torques as bars against their peaks; its feet's normal forces, slips and how far they are pressed in; the height of its centre over the last 12 s, a figure that separates; the energy's account (the energy, the motors' work, the electrical energy drawn and its peak power, the cost of transport, the residual over time, the flight's angular momentum, the method's cost and its fallbacks).

The page plays the frames by the robot's time a little behind the newest it has (`robot.js`, `Playback`). The motion is smooth while the engine is asked for more, and a gap is crossed by a jump.

### 2.3 The Rabbit in the World (`robot-world.js`)

The rabbit is drawn in the world at its site, at true scale, its plane placed by its axes in the body's fixed frame (forward along the azimuth, up the normal, left their product):
- its links are the catalogue's shapes, the torso's box with its edges rounded;
- its motors are dark cylinders at the joints;
- a head, eyes and ears are drawn, their mass in the torso's;
- it is lit by the Sun from where the Sun is at the site, and casts a soft shadow along it;
- the ground the simulation stands on, level at the terrain's height under the start, is a ticked strip of orchid, drawn as what it is.

*Watch it* flies the camera to the robot's side at a metre and a half; *Follow* keeps the camera's target on it. The globe's controls let the camera come that near: their clearance above the ground is now a property (the infrastructure's visualization layer).

## 3. Alternatives Considered

- **The robot in the browser** (the dynamics in JavaScript). Rejected: the domain's C++ is the robot, held to its checks. The page draws its frames.
- **Streaming every step.** Rejected: the frames at 60 Hz of the robot's time are what a drawing needs; the energy's account and the checks are computed in the engine at every step.
- **The terrain under the feet.** Deferred: at the robot's scale LOLA's grid is flat, and a slope is the domain's open question. The strip shows where the simulation's ground is.
- **A fish in the sea of the Earth.** Next, with the spatial tree.

## 4. Consequences

- The engine answers seven more operations; the server allows them, the writes as a mission's, at most 5 s of the robot's time a step and 30 s a run.
- The checks gain the page's arithmetic of the robot's plane, links and frames (13) and the engine's rabbit: its catalogue, a hop forward on the Moon, the refusal on the Earth, the gravity of each (12).
- The world shows a body at the scale of a metre. Its terrain is the data library's, and the robot stands on a level line at its height.
