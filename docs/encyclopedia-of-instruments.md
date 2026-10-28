---
title: An Encyclopedia of Scientific Instruments
status: draft
date: 2026-10-28
---

# An Encyclopedia of Scientific Instruments

*Status: draft, 2026-10-28.* The families of instruments of the encyclopedia the user gave Cosmopoiesis ("Extended Scientific Sensor Encyclopedia", taxonomy v0.2), as it gave them: each family, its instruments and methods, and its principal observables. It is the source of the declared families (`engine/declared.hpp`, written by `engine/tools/make_declared.py`); how each family is observed, by which kernel, and what of it is implemented, is in [instruments.md](instruments.md).

## A. Spacetime, navigation, geometry and mechanics

| Family | Instruments and methods | Principal observables |
|---|---|---|
| A01. Time and frequency metrology | Cesium atomic clock, rubidium clock, hydrogen maser, optical lattice clock, ion clock, frequency counter, time-interval counter, phase-noise analyzer, PPS time receiver, two-way time-transfer terminal | Time interval, clock offset, frequency, phase, stability |
| A02. Position and ranging | GNSS, RTK-GNSS, PPP receiver, pseudolite receiver, UWB ranging, laser tracker, laser interferometric ranging, radio beacon, radio occultation receiver, acoustic LBL/USBL/SBL positioning | Position, pseudorange, range, propagation delay |
| A03. Orientation and attitude | Star tracker, Sun sensor, horizon sensor, limb tracker, magnetic compass, inclinometer, electrolytic tilt sensor, MEMS tilt sensor, optical attitude tracker | Attitude, inclination, reference directions |
| A04. Inertial measurement | MEMS accelerometer, piezoelectric accelerometer, force-balance accelerometer, ring-laser gyro, fiber-optic gyro, MEMS gyro, hemispherical resonator gyro, IMU, atomic inertial sensor | Specific force, angular rate, inertial motion |
| A05. Motion and odometry | Rotary encoder, linear encoder, tachometer, optical-flow sensor, visual odometry camera, wheel odometer, laser Doppler velocimeter, Doppler velocity log, motion-capture marker system | Displacement, rotation, velocity, relative motion |
| A06. Contact and force | Load cell, force-torque sensor, strain gauge, tactile array, force-sensing resistor, capacitive contact sensor, piezoelectric force sensor, pressure-sensitive film, contact switch | Contact, normal/tangential force, pressure, torque |
| A07. Structural deformation | Extensometer, displacement transducer, LVDT, crack meter, fiber Bragg grating, digital image correlation system, laser vibrometer, curvature sensor, structural tilt meter | Strain, displacement, curvature, structural motion |
| A08. Geometry and mapping | 2D LiDAR, 3D LiDAR, FMCW LiDAR, flash LiDAR, structured-light scanner, time-of-flight camera, stereo camera, photogrammetry system, laser triangulation sensor, terrestrial laser scanner | Range, surfaces, depth maps, point clouds |
| A09. Surface metrology | Stylus profilometer, white-light interferometric profiler, confocal profiler, focus-variation microscope, chromatic confocal sensor, optical coherence tomography, scanning probe profiler | Surface roughness, height, microscopic morphology |

## B. Thermal, fluid, acoustic and environmental physics

| Family | Instruments and methods | Principal observables |
|---|---|---|
| B01. Contact thermometry | Thermocouple, thermistor, RTD, silicon temperature sensor, resistance thermometer, cryogenic diode thermometer, fiber-optic thermometer | Temperature-dependent instrument responses |
| B02. Remote thermometry | IR thermometer, thermal camera, pyrometer, two-color pyrometer, bolometric imager, microwave temperature sounder | Radiance and inferred temperature |
| B03. Heat and calorimetry | Heat-flux plate, differential scanning calorimeter, isothermal calorimeter, heat-flow calorimeter, thermal conductivity probe, thermal diffusivity analyzer | Heat flux, transferred energy, thermal properties |
| B04. Pressure and vacuum | Piezoresistive pressure transducer, capacitive pressure sensor, quartz pressure gauge, differential manometer, barometer, Pirani gauge, ionization gauge, capacitance diaphragm gauge | Pressure, pressure difference, vacuum-related signals |
| B05. Flow and velocity | Pitot tube, hot-wire anemometer, ultrasonic flowmeter, electromagnetic flowmeter, Coriolis flowmeter, vortex flowmeter, turbine flowmeter, particle image velocimetry, laser Doppler anemometry | Flow speed, volumetric flow, velocity fields |
| B06. Turbulence and mixing | Hot-film probe, multi-hole pressure probe, turbulence shear probe, sonic anemometer, eddy-covariance flux system, microstructure profiler | Velocity fluctuations, turbulence statistics, fluxes |
| B07. Acoustic pressure and sound | Condenser microphone, MEMS microphone, piezoelectric microphone, hydrophone, low-frequency hydrophone, pressure-gradient microphone, acoustic array, infrasound sensor | Acoustic waveforms, sound pressure, spectra |
| B08. Active acoustics | Single-beam sonar, multibeam sonar, side-scan sonar, synthetic-aperture sonar, acoustic imaging camera, acoustic tomography system, ultrasonic rangefinder, ultrasonic thickness gauge | Echoes, range, acoustic scattering and propagation |
| B09. Elastic waves and vibration | Geophone, seismometer, acoustic emission transducer, piezoelectric vibration sensor, ultrasonic nondestructive testing probe, resonant frequency sensor, laser Doppler vibrometer | Elastic waves, structural vibrations, resonances |
| B10. Density and rheology | Vibrating-tube densitometer, hydrometer, oscillating U-tube meter, rotational rheometer, capillary viscometer, falling-ball viscometer, ultrasonic density sensor | Density, viscosity, rheological response |

## C. Electromagnetism, optics and radiation

| Family | Instruments and methods | Principal observables |
|---|---|---|
| C01. Magnetic-field sensing | Fluxgate magnetometer, Hall magnetometer, AMR/GMR/TMR magnetometer, search-coil magnetometer, proton-precession magnetometer, Overhauser magnetometer, optically pumped magnetometer, SQUID, NV-diamond magnetometer | $\mathbf B$, field magnitude, temporal variations |
| C02. Magnetic gradients and material response | Magnetic gradiometer, susceptometer, vibrating-sample magnetometer, hysteresis loop tracer, magnetic force microscope, magnetic resonance probe | Field gradients, magnetization, susceptibility |
| C03. Electric fields and charge | Field mill, electrostatic voltmeter, electrometer, Kelvin probe, electric-field antenna, electro-optic field probe, charge amplifier, charge detector | Electric field, charge, potential, induced signal |
| C04. Electric circuits | Voltmeter, ammeter, shunt monitor, Hall current sensor, Rogowski coil, impedance analyzer, LCR meter, oscilloscope, power analyzer, leakage-current detector | Voltage, current, impedance, electrical power |
| C05. Radio and microwave signals | RF receiver, software-defined radio, radio spectrometer, vector network analyzer, spectrum analyzer, microwave radiometer, antenna array, polarization receiver | Frequency spectra, RF power, phase, polarization |
| C06. Radar sensing | Pulsed radar, FMCW radar, Doppler radar, phased-array radar, synthetic-aperture radar, interferometric SAR, ground-penetrating radar, cloud radar, scatterometer | Radar echo, range, Doppler shift, backscatter |
| C07. Optical imaging | Monochrome camera, RGB camera, multispectral camera, hyperspectral imager, event camera, polarization camera, intensified camera, high-speed camera, low-light camera | Spatially resolved optical signals |
| C08. Optical intensity and polarization | Photodiode, photomultiplier, photometer, lux meter, polarimeter, ellipsometer, integrating sphere, optical power meter, wavefront sensor | Optical power, radiance, polarization, wavefront |
| C09. Optical spectroscopy | UV–Vis spectrometer, NIR spectrometer, FTIR spectrometer, Raman spectrometer, fluorescence spectrometer, emission spectrometer, absorption spectrometer, terahertz spectrometer | Wavelength-dependent optical response |
| C10. Radiative energy | Pyranometer, pyrgeometer, net radiometer, spectroradiometer, solar irradiance monitor, UV radiometer, bolometer, photopolarimeter | Irradiance, radiance, radiative flux |
| C11. Ionizing radiation | Geiger–Müller detector, ionization chamber, proportional counter, scintillation counter, semiconductor detector, dosimeter, thermoluminescent dosimeter, Cherenkov detector | Ionization, energy deposition, dose, counts |
| C12. Nuclear and particle spectroscopy | Gamma-ray spectrometer, X-ray spectrometer, neutron spectrometer, alpha spectrometer, beta spectrometer, gamma camera, neutron counter, time-of-flight particle detector | Radiation type, deposited energy and particle spectra |

## D. Atmospheres, oceans and planetary environments

| Family | Instruments and methods | Principal observables |
|---|---|---|
| D01. Atmospheric thermodynamics | Radiosonde, barosonde, hygrometer, dew-point mirror, frost-point hygrometer, microwave temperature sounder, atmospheric sounding radiometer | Pressure, temperature, water vapor |
| D02. Wind and turbulence | Cup anemometer, vane anemometer, ultrasonic anemometer, Doppler wind LiDAR, wind profiler radar, balloon drift tracker, turbulence probe | Wind, air motion, atmospheric turbulence |
| D03. Clouds, rain and precipitation | Rain gauge, disdrometer, ceilometer, cloud radar, precipitation radar, cloud particle imager, snow gauge, optical precipitation sensor | Cloud height, particles, precipitation |
| D04. Aerosols and air quality | Optical particle counter, condensation particle counter, nephelometer, aethalometer, aerosol mass spectrometer, PM monitor, aerosol LiDAR | Aerosol number, size, scattering, composition |
| D05. Atmospheric trace gases | Ozone sonde, CO₂ analyzer, methane analyzer, NOx analyzer, SO₂ analyzer, cavity ring-down spectrometer, differential optical absorption spectrometer | Atmospheric gas concentrations |
| D06. Ocean thermohaline properties | CTD, thermosalinograph, conductivity cell, salinometer, sound-speed profiler, expendable bathythermograph, ocean microstructure thermometer | Temperature, conductivity, pressure, inferred salinity |
| D07. Ocean currents and transport | ADCP, single-point current meter, electromagnetic current meter, acoustic Doppler velocimeter, surface drifter tracker, float positioning receiver | Currents, water movement, transport |
| D08. Sea level, waves and tides | Tide gauge, wave buoy, wave radar, bottom-pressure recorder, pressure inverted echo sounder, laser wave-height sensor, GNSS wave buoy | Sea-level variation, wave motion |
| D09. Ocean chemistry | Dissolved oxygen optode, pH sensor, pCO₂ sensor, nitrate analyzer, phosphate analyzer, silicate analyzer, dissolved methane sensor, redox probe | Marine chemical conditions |
| D10. Suspended particles and ocean optics | Turbidimeter, transmissometer, fluorometer, optical backscatter sensor, underwater spectroradiometer, marine particle-size analyzer, plankton imaging system | Turbidity, attenuation, fluorescence, particles |
| D11. Cryosphere | Ice-penetrating radar, snow radar, snow-water-equivalent sensor, ice-thickness sonar, ice-temperature string, ice-drift beacon, snow penetrometer | Ice/snow depth, motion, internal structure |
| D12. Hydrothermal and seabed environments | Vent temperature array, seafloor pressure recorder, porewater sampler, hydrothermal-fluid analyzer, bottom tilt meter, benthic flow meter, dissolved gas sensor | Seabed pressure, fluid flow, heat, chemical exchange |

## E. Solid Earth, planetary surfaces and subsurface investigation

| Family | Instruments and methods | Principal observables |
|---|---|---|
| E01. Seismology | Broadband seismometer, short-period seismometer, strong-motion accelerograph, geophone array, ocean-bottom seismometer, borehole seismometer | Seismic waves and ground motion |
| E02. Geodetic deformation | GNSS deformation station, extensometer, strainmeter, tiltmeter, InSAR observation, laser distance meter, borehole deformation sensor | Surface and subsurface displacement |
| E03. Gravity surveys | Absolute gravimeter, spring gravimeter, superconducting gravimeter, atom-interferometric gravimeter, gravity gradiometer, spacecraft gravity-tracking experiment | Gravitational acceleration and gradients |
| E04. Magnetic geophysics | Field magnetometer, airborne magnetic gradiometer, marine magnetometer, borehole magnetometer, paleomagnetic magnetometer, susceptibility meter | Crustal magnetism and magnetic anomalies |
| E05. Electrical geophysics | Electrical resistivity tomography, induced-polarization survey, self-potential array, telluric-current sensor, electrical conductivity probe | Electrical properties and inferred subsurface structures |
| E06. Electromagnetic sounding | Magnetotelluric station, controlled-source EM receiver, time-domain EM system, frequency-domain EM system, transient electromagnetic sounder, ground-penetrating radar | Electromagnetic response of subsurface materials |
| E07. Geological drilling and boreholes | Borehole gamma log, neutron porosity log, sonic log, electrical resistivity log, caliper log, borehole camera, formation pressure tester, borehole temperature probe | Geological stratification and rock properties |
| E08. Soil and porous media | TDR moisture sensor, capacitance moisture probe, tensiometer, soil suction sensor, piezometer, lysimeter, permeability test apparatus, soil gas probe | Soil water, pore pressure, permeability, gas |
| E09. Volcanic and geothermal activity | Volcanic gas analyzer, fumarole temperature probe, thermal camera, ground deformation monitor, volcanic infrasound array, volcanic seismic array, geothermal heat-flow probe | Gas release, deformation, heat, seismicity |
| E10. Surface and regolith science | Cone penetrometer, robotic scoop force sensor, abrasion resistance tester, dielectric permittivity probe, thermal-property probe, regolith particle-size analyzer, surface composition spectrometer | Mechanical, dielectric, thermal and chemical properties |

## F. Spacecraft, plasma physics and astrophysics

| Family | Instruments and methods | Principal observables |
|---|---|---|
| F01. Space plasma particles | Langmuir probe, Faraday cup, retarding-potential analyzer, ion drift meter, ion spectrometer, electron spectrometer, electrostatic analyzer | Plasma current, particle distributions, inferred plasma state |
| F02. Plasma waves and fields | Electric antenna, search-coil magnetometer, wave receiver, plasma-wave spectrometer, radio-and-plasma-wave instrument, impedance probe | Plasma oscillations and electromagnetic fluctuations |
| F03. Energetic particles and space radiation | Cosmic-ray telescope, energetic particle detector, heavy-ion counter, proton spectrometer, electron telescope, neutron monitor, solid-state telescope | Energetic particle fluxes and spectra |
| F04. Dust and impact science | Micrometeoroid detector, dust impact ionization detector, dust mass spectrometer, dust trajectory detector, impact acoustic sensor, cosmic dust collector | Dust impacts, momentum, composition |
| F05. Neutral atmosphere and exosphere | Neutral mass spectrometer, ion-neutral mass spectrometer, ultraviolet occultation spectrograph, neutral particle detector, atmospheric drag accelerometer | Neutral species and exospheric properties |
| F06. Planetary remote sensing | Planetary camera, infrared mapper, UV spectrograph, radar sounder, laser altimeter, thermal emission spectrometer, neutron spectrometer, gamma-ray mapper | Terrain, composition, atmospheric and subsurface properties |
| F07. Astronomy and observatories | Optical telescope detector, radio telescope receiver, interferometer, spectrograph, coronagraph, photometer, astrometric camera, integral-field spectrograph | Celestial radiation, spectra, angular position |
| F08. High-energy astronomy | X-ray CCD, X-ray calorimeter, coded-aperture gamma imager, Compton telescope, Cherenkov telescope, hard X-ray detector, gamma-ray burst monitor | High-energy photon and particle signals |
| F09. Gravitational-wave and precision experiments | Laser interferometric gravitational-wave detector, resonant gravitational-wave antenna, atom-interferometric gradiometer, precision optical displacement interferometer | Differential displacement or phase signals associated with spacetime disturbances |
| F10. Spacecraft health and environment | Solar-array current monitor, radiation dosimeter, spacecraft charging monitor, thermal control sensors, propulsion pressure sensor, reaction-wheel tachometer, fuel-gauge sensor | Spacecraft physical and operational condition |

## G. Chemistry, molecular science and materials

| Family | Instruments and methods | Principal observables |
|---|---|---|
| G01. Gas analysis | Gas chromatograph, residual gas analyzer, quadrupole mass spectrometer, photoionization detector, infrared gas analyzer, electrochemical gas detector, thermal conductivity detector | Gas identities, concentrations and mass spectra |
| G02. Liquid chemical analysis | pH electrode, ion-selective electrode, conductivity meter, dissolved oxygen optode, oxidation-reduction potential electrode, total organic carbon analyzer, nutrient analyzer | Chemical activity, concentration-related signals |
| G03. Molecular spectroscopy | Raman, FTIR, UV–Vis, fluorescence, NMR, EPR/ESR, terahertz spectroscopy, circular dichroism spectroscopy | Molecular and electronic spectral responses |
| G04. Mass and separation analysis | GC–MS, LC–MS, ICP–MS, MALDI–TOF, ion mobility spectrometry, capillary electrophoresis detector, isotope-ratio mass spectrometer | Molecular masses, species separation, isotopic composition |
| G05. Atomic and elemental analysis | XRF, XPS, AES, LIBS, ICP–OES, atomic absorption spectrometer, secondary-ion mass spectrometer | Elemental and near-surface chemical composition |
| G06. Crystallography and structure | X-ray diffractometer, neutron diffractometer, electron diffraction system, SAXS, WAXS, pair-distribution-function measurement, electron backscatter diffraction | Crystal structure, ordering, scattering patterns |
| G07. Microscopy and nanoscale geometry | SEM, TEM, STEM, AFM, STM, confocal microscope, near-field optical microscope, scanning ion conductance microscope | Microstructure, surface and nanoscale responses |
| G08. Mechanical materials testing | Nanoindenter, hardness tester, tensile-testing machine, compression tester, fatigue tester, fracture toughness apparatus, dynamic mechanical analyzer | Load–deformation behavior and derived material properties |
| G09. Thermal and phase characterization | DSC, DTA, thermogravimetric analyzer, dilatometer, thermal conductivity analyzer, phase-transition calorimeter, thermomechanical analyzer | Thermal response, expansion, transitions and mass change |
| G10. Electronic and magnetic materials | Four-point probe, Hall-effect measurement system, dielectric spectrometer, ferroelectric polarization tester, magnetometer, superconducting transition measurement, impedance spectrometer | Transport, dielectric, polarization and magnetic properties |

## H. Biology, ecology, physiology and medicine

| Family | Instruments and methods | Principal observables |
|---|---|---|
| H01. Cellular imaging | Bright-field microscope, phase-contrast microscope, fluorescence microscope, confocal microscope, light-sheet microscope, electron microscope, live-cell imaging system | Images of cells and cellular structures |
| H02. Single-cell and microbial analysis | Flow cytometer, fluorescence-activated cell sorter, Coulter counter, cell impedance sensor, microfluidic cell analyzer, microbial ATP detector | Cell counts, distributions, molecular signals |
| H03. Biomolecular sensing | DNA sequencer, RNA sequencer, PCR thermocycler with fluorescence detection, nanopore biosensor, immunoassay reader, surface plasmon resonance biosensor | Molecular signals and inferred sequences or binding events |
| H04. Biological chemistry | Glucose sensor, lactate sensor, oxygen microelectrode, enzyme activity sensor, metabolite analyzer, ATP bioluminescence detector, dissolved organic matter analyzer | Metabolites, chemical concentrations, biochemical activity |
| H05. Ecological and biodiversity monitoring | Camera trap, bioacoustic recorder, animal telemetry tag, acoustic fish-tag receiver, plankton imaging system, eDNA sampler and analyzer, pollinator monitoring camera | Biological presence, activity and ecological indicators |
| H06. Neurophysiology | EEG, MEG, ECoG, intracranial electrode, neural microelectrode array, calcium imaging system, functional near-infrared spectroscopy | Neural electrical, magnetic, optical or hemodynamic signals |
| H07. Cardiovascular and respiratory physiology | ECG, photoplethysmograph, blood pressure monitor, pulse oximeter, spirometer, capnograph, respiratory flow sensor, Doppler ultrasound | Cardiac and respiratory physiological signals |
| H08. Clinical and anatomical imaging | MRI, fMRI, MR spectroscopy, CT, PET, SPECT, ultrasound imaging, optical coherence tomography | Anatomical and physiological images or derived maps |
| H09. Biomechanics and behavior | EMG, eye tracker, force plate, motion-capture system, wearable accelerometer, gait pressure sensor, electromyography array | Muscle activity, movement, posture, behavior |
| H10. Environmental biological hazards | Airborne bioaerosol sampler, pathogen assay reader, toxin biosensor, microbiological water tester, allergen sampler, fluorescence-based microbial detector | Biological contamination and molecular indicators |

## I. Advanced quantum, atomic and fundamental-physics experiments

| Family | Instruments and methods | Principal observables |
|---|---|---|
| I01. Quantum magnetometry | NV-center magnetometer, SQUID, atomic vapor magnetometer, spin-exchange-relaxation-free magnetometer, superconducting gradiometer | Magnetic-field-dependent quantum responses |
| I02. Atomic precision sensing | Atom interferometer, optical clock, cold-atom gravimeter, trapped-ion field sensor, Rydberg atom RF sensor | Phase shifts, frequency shifts, acceleration or field response |
| I03. Single-photon detection | SPAD, superconducting nanowire detector, transition-edge sensor, photon-number-resolving detector, photomultiplier, intensified photon camera | Photon detection events and photon statistics |
| I04. Spin and condensed-matter measurements | Spin-resolved photoemission, spin-polarized STM, neutron spin-echo spectrometer, muon spin rotation apparatus, NMR relaxometer | Spin-dependent spectra and material dynamics |
| I05. Cryogenic and ultrasensitive detectors | Cryogenic microcalorimeter, superconducting bolometer, kinetic inductance detector, transition-edge sensor array, low-temperature charge amplifier | Very small energy deposits and weak signals |
| I06. Neutrino and rare-event detection | Water Cherenkov detector, liquid scintillator detector, liquid argon TPC, germanium rare-event detector, cryogenic dark-matter detector | Rare interactions and reconstructed particle events |
| I07. Particle-physics instrumentation | Silicon pixel tracker, drift chamber, time projection chamber, calorimeter, muon detector, ring-imaging Cherenkov detector, time-of-flight hodoscope | Tracks, energies, interactions and event topology |
| I08. Quantum-system characterization | Qubit readout resonator, superconducting qubit readout chain, ion fluorescence detector, homodyne detector, quantum-state tomography apparatus, correlation measurement system | Measurement outcomes, correlations, reconstructed quantum states |

## J. Infrastructure, safety, computational and virtual sensing

| Family | Instruments and methods | Principal observables |
|---|---|---|
| J01. Electrical infrastructure | Battery monitor, power meter, smart shunt, insulation monitor, leakage-current sensor, transformer monitoring system, power-quality analyzer | Voltage, current, charge, power and equipment state |
| J02. Actuator and propulsion monitoring | Motor encoder, torque sensor, motor current monitor, thrust stand, chamber pressure sensor, fuel-flow sensor, valve-position sensor, reaction-wheel tachometer | Actuator output and operating conditions |
| J03. Equipment diagnostics | Bearing vibration monitor, thermal monitoring array, acoustic-emission detector, structural health sensor, corrosion monitor, leak detector, cable integrity monitor | Condition and failure indicators |
| J04. Discrete-event detection | Impact switch, limit switch, proximity detector, collision detector, threshold-crossing detector, radiation alarm, fault interrupt, emergency-stop input | Discrete events and status transitions |
| J05. Communications observation | Signal-strength monitor, packet-error monitor, latency monitor, synchronization monitor, network spectrum monitor, telemetry channel monitor | Communication quality and timing |
| J06. Ideal numerical probes | Scalar-field probe, vector-field probe, tensor-field probe, geometric-distance probe, particle-density probe, distribution-function probe | Directly queried simulated quantities |
| J07. Derived computational probes | Vorticity probe, divergence monitor, stress invariant estimator, heat-flux estimator, energy-budget monitor, conservation-law residual monitor, trajectory intersection detector | Derived physical or numerical quantities |
| J08. Synthetic and generative sources | Procedural scene probe, stochastic observation generator, learned field emulator, historical-data sampler, sensor response surrogate, conditional generative instrument | Synthetic fields and observations |
| J09. Data-fusion estimators | Kalman state estimator, particle-filter tracker, Bayesian field reconstructor, multisensor localization, environmental data-assimilation system | Inferred states and uncertainties |
| J10. Simulation validation monitors | Mesh-quality monitor, numerical error estimator, residual monitor, conservation checker, solver convergence detector, boundary-condition monitor, time-step stability monitor | Numerical model diagnostics |
