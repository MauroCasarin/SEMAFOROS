
import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { Car, Street, TrafficLightState } from '../types';

// --- CONSTANTS ---
const ROAD_WIDTH = 20;
const ROAD_LENGTH = 200; 
const LANE_WIDTH = ROAD_WIDTH / 4;
const SIMULATION_SPEED = 0.2;

// --- CONFIGURATION ADJUSTMENTS ---

const STOP_LINE_V = 20; 
const STOP_LINE_H = 20; 

const SENSOR_ZONE_LENGTH = 40; 
const SENSOR_ZONE_V_POS = 40; 
const SENSOR_ZONE_H_POS = 40; 

// Physical Car Properites
const CAR_LENGTH = 4.5;
const MIN_GAP = 3.0; // Gap between cars in queue
const QUEUE_DISTANCE = CAR_LENGTH + MIN_GAP; // 7.5 units

// --- CLASS: TrafficLightController ---
class TrafficLightController {
    public stateV: TrafficLightState = TrafficLightState.RED;
    public stateH: TrafficLightState = TrafficLightState.RED;
    public isSmartMode: boolean = true; 

    private lightV_red: THREE.Mesh;
    private lightV_yellow: THREE.Mesh;
    private lightV_green: THREE.Mesh;
    private lightH_red: THREE.Mesh;
    private lightH_yellow: THREE.Mesh;
    private lightH_green: THREE.Mesh;

    private greenTimeV: number = 0;
    private greenTimeH: number = 0;
    private standardCycleTime: number = 0;
    private transitioningTo: Street | null = null;
    
    // Smart Config
    private readonly MAX_GREEN_TIME = 15; 
    private readonly MIN_GREEN_TIME = 2.0;  
    
    // Fixed Config
    private readonly FIXED_GREEN_DURATION = 4.0; 
    private fixedTimer: number = 0;

    private readonly YELLOW_DURATION = 1.0; 
    private readonly STANDARD_CYCLE_DURATION = 5;

    constructor(scene: THREE.Scene) {
        this.createTrafficLightMeshes(scene);
        this.updateLights();
        this.stateV = TrafficLightState.RED;
        this.stateH = TrafficLightState.GREEN; 
    }

    private createTrafficLightMeshes(scene: THREE.Scene) {
        const createLight = (color: number) => {
            const geometry = new THREE.SphereGeometry(2.2, 32, 32); 
            const material = new THREE.MeshStandardMaterial({ 
                color: 0x111111, 
                emissive: 0x000000,
                emissiveIntensity: 0,
                roughness: 0.1,
                metalness: 0.3
            });
            return new THREE.Mesh(geometry, material);
        };
        
        const createGantry = (x: number, z: number, rotationY: number) => {
            const group = new THREE.Group();
            
            const postGeo = new THREE.BoxGeometry(0.5, 16, 0.5);
            const postMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
            const post1 = new THREE.Mesh(postGeo, postMat);
            post1.position.set(-ROAD_WIDTH/2 - 2, 8, 0);
            const post2 = new THREE.Mesh(postGeo, postMat);
            post2.position.set(ROAD_WIDTH/2 + 2, 8, 0);
            
            const beamGeo = new THREE.BoxGeometry(ROAD_WIDTH + 6, 0.4, 0.4);
            const beam = new THREE.Mesh(beamGeo, postMat);
            beam.position.set(0, 15, 0);
            
            group.add(post1, post2, beam);
            group.position.set(x, 0, z);
            group.rotation.y = rotationY;
            scene.add(group);
            return { group };
        };

        // 1. Vertical Gantry
        createGantry(0, STOP_LINE_V + 2, 0);

        const vLightX = ROAD_WIDTH/4; 
        const vLightZ = STOP_LINE_V + 2; 
        const vLightYBase = 12; 

        this.lightV_red = createLight(0xff0000);
        this.lightV_yellow = createLight(0xffff00);
        this.lightV_green = createLight(0x00ff00);

        this.lightV_red.position.set(vLightX, vLightYBase + 2.5, vLightZ);
        this.lightV_yellow.position.set(vLightX, vLightYBase, vLightZ);
        this.lightV_green.position.set(vLightX, vLightYBase - 2.5, vLightZ);

        scene.add(this.lightV_red, this.lightV_yellow, this.lightV_green);

        // 2. Horizontal Gantry
        createGantry(STOP_LINE_H + 2, 0, -Math.PI / 2);

        const hLightX = STOP_LINE_H + 2;
        const hLightZ = -ROAD_WIDTH/4;
        const hLightYBase = 12;

        this.lightH_red = createLight(0xff0000);
        this.lightH_yellow = createLight(0xffff00);
        this.lightH_green = createLight(0x00ff00);

        this.lightH_red.position.set(hLightX, hLightYBase + 2.5, hLightZ);
        this.lightH_yellow.position.set(hLightX, hLightYBase, hLightZ);
        this.lightH_green.position.set(hLightX, hLightYBase - 2.5, hLightZ);

        scene.add(this.lightH_red, this.lightH_yellow, this.lightH_green);
    }
    
    private updateOneLight(mesh: THREE.Mesh, isOn: boolean, colorHex: number) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (isOn) {
            mat.color.setHex(colorHex);
            mat.emissive.setHex(colorHex);
            mat.emissiveIntensity = 4.0; 
        } else {
            mat.color.setHex(0x111111);
            mat.emissive.setHex(0x000000);
            mat.emissiveIntensity = 0;
        }
    }

    private updateLights() {
        this.updateOneLight(this.lightV_red, this.stateV === TrafficLightState.RED, 0xff0000);
        this.updateOneLight(this.lightV_yellow, this.stateV === TrafficLightState.YELLOW, 0xffff00);
        this.updateOneLight(this.lightV_green, this.stateV === TrafficLightState.GREEN, 0x00ff00);

        this.updateOneLight(this.lightH_red, this.stateH === TrafficLightState.RED, 0xff0000);
        this.updateOneLight(this.lightH_yellow, this.stateH === TrafficLightState.YELLOW, 0xffff00);
        this.updateOneLight(this.lightH_green, this.stateH === TrafficLightState.GREEN, 0x00ff00);
    }
    
    private requestGreen(street: Street) {
        if (street === Street.VERTICAL && this.stateV !== TrafficLightState.GREEN && !this.transitioningTo) {
            this.transitioningTo = Street.VERTICAL;
            this.startTransition(this.stateH, (s) => this.stateH = s, () => {
                this.stateV = TrafficLightState.GREEN;
                this.transitioningTo = null;
            });
        } else if (street === Street.HORIZONTAL && this.stateH !== TrafficLightState.GREEN && !this.transitioningTo) {
            this.transitioningTo = Street.HORIZONTAL;
            this.startTransition(this.stateV, (s) => this.stateV = s, () => {
                this.stateH = TrafficLightState.GREEN;
                this.transitioningTo = null;
            });
        }
    }

    private startTransition(currentState: TrafficLightState, stateSetter: (s: TrafficLightState) => void, onComplete: () => void) {
        if (currentState === TrafficLightState.GREEN) {
            stateSetter(TrafficLightState.YELLOW);
            setTimeout(() => {
                stateSetter(TrafficLightState.RED);
                onComplete();
            }, this.YELLOW_DURATION * 1000 / SIMULATION_SPEED);
        } else { 
            onComplete();
        }
    }

    public update(dt: number, countV: number, countH: number) {
        if (this.transitioningTo) {
            this.updateLights();
            return;
        }

        if (this.isSmartMode) {
            if (this.stateV === TrafficLightState.GREEN) this.greenTimeV += dt;
            else this.greenTimeV = 0;
            
            if (this.stateH === TrafficLightState.GREEN) this.greenTimeH += dt;
            else this.greenTimeH = 0;

            if (this.stateV === TrafficLightState.GREEN && this.greenTimeV > this.MAX_GREEN_TIME && countH > 0) {
                this.requestGreen(Street.HORIZONTAL);
            } else if (this.stateH === TrafficLightState.GREEN && this.greenTimeH > this.MAX_GREEN_TIME && countV > 0) {
                this.requestGreen(Street.VERTICAL);
            } else if (countV > countH && this.stateH === TrafficLightState.GREEN && this.greenTimeH > this.MIN_GREEN_TIME) {
                 this.requestGreen(Street.VERTICAL);
            } else if (countH > countV && this.stateV === TrafficLightState.GREEN && this.greenTimeV > this.MIN_GREEN_TIME) {
                 this.requestGreen(Street.HORIZONTAL);
            } else if (countV === countH && countV > 0) {
                 this.standardCycleTime += dt;
                 if (this.standardCycleTime > this.STANDARD_CYCLE_DURATION) {
                    this.standardCycleTime = 0;
                    if (this.stateV === TrafficLightState.GREEN) this.requestGreen(Street.HORIZONTAL);
                    else this.requestGreen(Street.VERTICAL);
                 }
            }
        } else {
            this.fixedTimer += dt;
            if (this.fixedTimer > this.FIXED_GREEN_DURATION) {
                this.fixedTimer = 0;
                if (this.stateV === TrafficLightState.GREEN) {
                    this.requestGreen(Street.HORIZONTAL);
                } else if (this.stateH === TrafficLightState.GREEN) {
                    this.requestGreen(Street.VERTICAL);
                } else if (this.stateV === TrafficLightState.RED && this.stateH === TrafficLightState.RED) {
                    this.requestGreen(Street.VERTICAL);
                }
            }
        }
        this.updateLights();
    }
}


// --- REACT COMPONENT ---
const TrafficSimulation: React.FC = () => {
    const mountRef = useRef<HTMLDivElement>(null);
    const carsRef = useRef<Car[]>([]);
    const trafficControllerRef = useRef<TrafficLightController | null>(null);

    const [trafficDensity, setTrafficDensity] = useState<number>(50); 
    const densityRef = useRef(50); 

    const [sensorCountV, setSensorCountV] = useState(0);
    const [sensorCountH, setSensorCountH] = useState(0);
    const [isSmartMode, setIsSmartMode] = useState(true);

    const sensorVPosRef = useRef({ x: 0, y: 0 });
    const sensorHPosRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        densityRef.current = trafficDensity;
    }, [trafficDensity]);

    useEffect(() => {
        if (trafficControllerRef.current) {
            trafficControllerRef.current.isSmartMode = isSmartMode;
        }
    }, [isSmartMode]);

    useEffect(() => {
        if (!mountRef.current) return;
        const mount = mountRef.current;

        // --- SCENE SETUP ---
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xd0d0d0); 
        
        const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 1, 1000);
        camera.position.set(60, 60, 60); 
        camera.lookAt(scene.position);
        
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        renderer.shadowMap.enabled = true;
        mount.appendChild(renderer.domElement);
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(50, 100, 50);
        dirLight.castShadow = true;
        scene.add(dirLight);
        
        createRoad(scene);
        createSensorZones(scene);
        trafficControllerRef.current = new TrafficLightController(scene);
        trafficControllerRef.current.isSmartMode = isSmartMode;
        
        const clock = new THREE.Clock();
        let spawnTimer = 0;
        
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            const dt = clock.getDelta() * SIMULATION_SPEED;

            spawnTimer += dt;
            // Spawn Interval based on density
            const spawnInterval = Math.max(0.2, 2.0 - (densityRef.current / 100) * 1.8);
            const maxCars = 15 + Math.floor((densityRef.current / 100) * 90); 

            if (spawnTimer > spawnInterval) { 
                spawnTimer = 0;
                if (carsRef.current.length < maxCars) {
                    attemptMultiLaneSpawn(scene, carsRef, densityRef.current);
                }
            }
            
            updateCars(dt, carsRef, trafficControllerRef);
            cleanupCars(scene, carsRef);

            const { countV, countH } = countCarsInSensors(carsRef);
            setSensorCountV(countV);
            setSensorCountH(countH);
            trafficControllerRef.current?.update(dt, countV, countH);

            updateOverlayPositions(scene, camera, renderer.domElement);
            renderer.render(scene, camera);
        };
        
        let animationFrameId = requestAnimationFrame(animate);
        
        const handleResize = () => {
            const { clientWidth, clientHeight } = mount;
            renderer.setSize(clientWidth, clientHeight);
            const aspect = clientWidth / clientHeight;
            const zoom = 50;
            camera.left = -zoom * aspect;
            camera.right = zoom * aspect;
            camera.top = zoom;
            camera.bottom = -zoom;
            camera.updateProjectionMatrix();
        };
        handleResize();
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
            if (mount.contains(renderer.domElement)) {
                mount.removeChild(renderer.domElement);
            }
            renderer.dispose();
        };
    }, []);

    const updateOverlayPositions = (scene: THREE.Scene, camera: THREE.Camera, canvas: HTMLCanvasElement) => {
        const sensorV = scene.getObjectByName("sensorV_center");
        const sensorH = scene.getObjectByName("sensorH_center");
        if (sensorV && sensorH) {
            const toScreenPosition = (obj: THREE.Object3D) => {
                const vector = new THREE.Vector3();
                obj.getWorldPosition(vector);
                vector.project(camera);
                const x = (vector.x * 0.5 + 0.5) * canvas.clientWidth;
                const y = (vector.y * -0.5 + 0.5) * canvas.clientHeight;
                return { x, y };
            };
            sensorVPosRef.current = toScreenPosition(sensorV);
            sensorHPosRef.current = toScreenPosition(sensorH);
        }
    };


    return (
        <div className="relative w-full h-[80vh] max-w-5xl aspect-square md:aspect-video rounded-lg shadow-2xl bg-gray-700 overflow-hidden">
            <div ref={mountRef} className="w-full h-full" />
            
            {isSmartMode && (
                <>
                    <div
                        className="absolute transform -translate-x-1/2 -translate-y-1/2 bg-black bg-opacity-70 text-cyan-300 border border-cyan-500 font-mono font-bold text-3xl px-4 py-2 rounded-lg pointer-events-none shadow-lg z-10"
                        style={{ left: `${sensorVPosRef.current.x}px`, top: `${sensorVPosRef.current.y}px` }}
                    >
                        {sensorCountV}
                    </div>
                    <div
                        className="absolute transform -translate-x-1/2 -translate-y-1/2 bg-black bg-opacity-70 text-cyan-300 border border-cyan-500 font-mono font-bold text-3xl px-4 py-2 rounded-lg pointer-events-none shadow-lg z-10"
                        style={{ left: `${sensorHPosRef.current.x}px`, top: `${sensorHPosRef.current.y}px` }}
                    >
                        {sensorCountH}
                    </div>
                </>
            )}

            <div className="absolute bottom-4 left-4 right-4 flex flex-col md:flex-row justify-between items-end md:items-center gap-4 z-20 pointer-events-none">
                <div className="w-full md:w-64 bg-gray-900 bg-opacity-90 p-4 rounded-lg shadow-xl border border-gray-600 text-white pointer-events-auto">
                    <label htmlFor="density-slider" className="block text-sm font-bold mb-3 text-cyan-400">
                        Densidad: {trafficDensity}%
                    </label>
                    <input
                        id="density-slider"
                        type="range"
                        min="1"
                        max="100"
                        value={trafficDensity}
                        onChange={(e) => setTrafficDensity(Number(e.target.value))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                    />
                </div>

                <div className="bg-gray-900 bg-opacity-90 p-4 rounded-lg shadow-xl border border-gray-600 text-white pointer-events-auto">
                    <p className="text-sm font-bold mb-2 text-cyan-400">Modo Semáforo</p>
                    <button
                        onClick={() => setIsSmartMode(!isSmartMode)}
                        className={`w-full px-4 py-2 rounded font-bold transition-colors ${
                            isSmartMode 
                            ? 'bg-cyan-600 hover:bg-cyan-500 text-white' 
                            : 'bg-orange-600 hover:bg-orange-500 text-white'
                        }`}
                    >
                        {isSmartMode ? "INTELIGENTE (Sensores)" : "MANUAL (4 seg)"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TrafficSimulation;

// --- HELPER FUNCTIONS ---

function createRoad(scene: THREE.Scene) {
    const roadMaterial = new THREE.MeshBasicMaterial({ color: 0x555555 });
    const verticalRoad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH), roadMaterial);
    verticalRoad.rotation.x = -Math.PI / 2;
    verticalRoad.receiveShadow = true;
    scene.add(verticalRoad);

    const horizontalRoad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_LENGTH, ROAD_WIDTH), roadMaterial);
    horizontalRoad.rotation.x = -Math.PI / 2;
    horizontalRoad.receiveShadow = true;
    scene.add(horizontalRoad);

    const intersection = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_WIDTH), roadMaterial);
    intersection.rotation.x = -Math.PI / 2;
    intersection.position.z = 0;
    intersection.receiveShadow = true;
    scene.add(intersection);

    const lineMaterialYellow = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
    const lineMaterialWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });

    for (let i = -ROAD_LENGTH / 2; i < ROAD_LENGTH / 2; i += 4) {
        if (Math.abs(i) > ROAD_WIDTH / 2 + 2) {
            const vLine = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.5), lineMaterialYellow);
            vLine.rotation.x = -Math.PI / 2;
            vLine.position.set(0, 0.02, i);
            scene.add(vLine);
            const hLine = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.5), lineMaterialYellow);
            hLine.rotation.x = -Math.PI / 2;
            hLine.position.set(i, 0.02, 0);
            scene.add(hLine);
        }
    }
    
    for (let i = -ROAD_LENGTH / 2; i < ROAD_LENGTH / 2; i += 6) {
        if (Math.abs(i) > ROAD_WIDTH / 2) {
             const vLine1 = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 3), lineMaterialWhite);
             vLine1.rotation.x = -Math.PI / 2;
             vLine1.position.set(LANE_WIDTH, 0.02, i);
             scene.add(vLine1);
             const vLine2 = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 3), lineMaterialWhite);
             vLine2.rotation.x = -Math.PI / 2;
             vLine2.position.set(-LANE_WIDTH, 0.02, i);
             scene.add(vLine2);

             const hLine1 = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.3), lineMaterialWhite);
             hLine1.rotation.x = -Math.PI / 2;
             hLine1.position.set(i, 0.02, LANE_WIDTH);
             scene.add(hLine1);
             const hLine2 = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.3), lineMaterialWhite);
             hLine2.rotation.x = -Math.PI / 2;
             hLine2.position.set(i, 0.02, -LANE_WIDTH);
             scene.add(hLine2);
        }
    }

    for(let i = 0; i < 9; i++) {
        const stripeWidth = 1.0;
        const stripeLength = LANE_WIDTH * 2 - 1;
        const stripeGeo = new THREE.PlaneGeometry(stripeWidth, stripeLength);
        
        const c1 = new THREE.Mesh(stripeGeo, lineMaterialWhite);
        c1.rotation.x = -Math.PI / 2;
        c1.position.set(-ROAD_WIDTH/2 + i*2 +1.5, 0.02, ROAD_WIDTH/2 + stripeLength/2);
        scene.add(c1)
        
        const c2 = new THREE.Mesh(stripeGeo, lineMaterialWhite);
        c2.rotation.x = -Math.PI / 2;
        c2.position.set(-ROAD_WIDTH/2 + i*2 +1.5, 0.02, -ROAD_WIDTH/2 - stripeLength/2);
        scene.add(c2)

        const c3 = new THREE.Mesh(stripeGeo, lineMaterialWhite);
        c3.rotation.x = -Math.PI / 2;
        c3.rotation.z = Math.PI/2;
        c3.position.set(ROAD_WIDTH/2 + stripeLength/2, 0.02, -ROAD_WIDTH/2 + i*2 +1.5);
        scene.add(c3)

        const c4 = new THREE.Mesh(stripeGeo, lineMaterialWhite);
        c4.rotation.x = -Math.PI / 2;
        c4.rotation.z = Math.PI/2;
        c4.position.set(-ROAD_WIDTH/2 - stripeLength/2, 0.02, -ROAD_WIDTH/2 + i*2 +1.5);
        scene.add(c4)
    }
}

function createSensorZones(scene: THREE.Scene) {
    const sensorMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ffff, 
        transparent: true, 
        opacity: 0.15,
        side: THREE.DoubleSide
    });
    
    const vGeo = new THREE.PlaneGeometry(ROAD_WIDTH - 2, SENSOR_ZONE_LENGTH);
    const vSensor = new THREE.Mesh(vGeo, sensorMaterial);
    vSensor.rotation.x = -Math.PI / 2;
    vSensor.position.set(0, 0.1, SENSOR_ZONE_V_POS); 
    scene.add(vSensor);

    const vCenter = new THREE.Object3D();
    vCenter.name = "sensorV_center";
    vCenter.position.set(0, 5, SENSOR_ZONE_V_POS);
    scene.add(vCenter);
    
    const hGeo = new THREE.PlaneGeometry(SENSOR_ZONE_LENGTH, ROAD_WIDTH - 2);
    const hSensor = new THREE.Mesh(hGeo, sensorMaterial);
    hSensor.rotation.x = -Math.PI / 2;
    hSensor.position.set(SENSOR_ZONE_H_POS, 0.1, 0); 
    scene.add(hSensor);

    const hCenter = new THREE.Object3D();
    hCenter.name = "sensorH_center";
    hCenter.position.set(SENSOR_ZONE_H_POS, 5, 0);
    scene.add(hCenter);
}


function createCar(): THREE.Group {
    const car = new THREE.Group();
    const colors = [0xff3333, 0x3333ff, 0x33ff33, 0xffff33, 0xff33ff, 0x33ffff, 0xffffff, 0x333333];
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random() * colors.length)], roughness: 0.2, metalness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, CAR_LENGTH), bodyMaterial);
    body.position.y = 1;
    body.castShadow = true;
    car.add(body);
    
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 2.5), new THREE.MeshStandardMaterial({color: 0x111111}));
    roof.position.set(0, 2.0, -0.2);
    car.add(roof);

    const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.6, 32);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

    const wheelPositions = [
        new THREE.Vector3(-1.2, 0.5, 1.5),
        new THREE.Vector3(1.2, 0.5, 1.5),
        new THREE.Vector3(-1.2, 0.5, -1.5),
        new THREE.Vector3(1.2, 0.5, -1.5),
    ];
    
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.position.copy(pos);
        wheel.rotation.z = Math.PI / 2;
        car.add(wheel);
    });
    
    return car;
}

function attemptMultiLaneSpawn(scene: THREE.Scene, carsRef: React.MutableRefObject<Car[]>, density: number) {
    const lanesToCheck = [
        { street: Street.VERTICAL, lane: 0 },
        { street: Street.VERTICAL, lane: 1 },
        { street: Street.HORIZONTAL, lane: 0 },
        { street: Street.HORIZONTAL, lane: 1 },
    ];

    // Shuffle lanes to randomize which one gets filled first if density is mid-range
    lanesToCheck.sort(() => Math.random() - 0.5);

    // If density is high, we basically try to fill ALL lanes every frame
    const aggressiveMode = density > 60;
    
    lanesToCheck.forEach(laneInfo => {
        // High probability to spawn if density is high
        const chance = aggressiveMode ? 0.9 : (density / 100);
        if (Math.random() < chance) {
             spawnCarInLane(scene, carsRef, laneInfo.street, laneInfo.lane);
        }
    });
}

function spawnCarInLane(scene: THREE.Scene, carsRef: React.MutableRefObject<Car[]>, street: Street, lane: number) {
    let spawnX = 0;
    let spawnZ = 0;
    let rotationY = 0;

    if (street === Street.VERTICAL) {
        spawnZ = ROAD_LENGTH / 2; 
        spawnX = (lane === 0 ? LANE_WIDTH / 2 : LANE_WIDTH * 1.5);
        rotationY = Math.PI; 
    } else { 
        spawnX = ROAD_LENGTH / 2; 
        spawnZ = (lane === 0 ? -LANE_WIDTH / 2 : -LANE_WIDTH * 1.5);
        rotationY = -Math.PI / 2; 
    }
    
    // Safety distance to ensure we don't spawn INSIDE another car
    const SPAWN_SAFE_DISTANCE = 45; 
    const isSafe = carsRef.current.every(existingCar => {
        if (existingCar.street === street && existingCar.lane === lane) {
            const dist = existingCar.mesh.position.distanceTo(new THREE.Vector3(spawnX, 0, spawnZ));
            return dist > SPAWN_SAFE_DISTANCE;
        }
        return true;
    });

    if (!isSafe) return;

    const carMesh = createCar();
    const carSpeed = 25 + Math.random() * 30; 

    const car: Car = {
        mesh: carMesh,
        street,
        lane,
        velocity: new THREE.Vector3(),
        raycaster: new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 0, 50), 
        stopped: false,
        uuid: carMesh.uuid,
        speed: carSpeed,
        isChangingLane: false,
        targetLane: lane,
        laneChangeProgress: 0,
        laneChangeDirection: 0
    };

    car.mesh.position.set(spawnX, 0, spawnZ);
    car.mesh.rotation.y = rotationY;

    scene.add(car.mesh);
    carsRef.current.push(car);
}

// Check if a specific spot in a lane is free of cars
function isLaneSpaceFree(cars: Car[], street: Street, lane: number, checkPos: THREE.Vector3, rangeFwd: number, rangeBack: number): boolean {
    return cars.every(c => {
        if (c.street !== street || (c.lane !== lane && !c.isChangingLane)) return true;
        const d = c.mesh.position.distanceTo(checkPos);
        return d > 30; // Need good clearance
    });
}

function updateCars(dt: number, carsRef: React.MutableRefObject<Car[]>, trafficControllerRef: React.MutableRefObject<TrafficLightController | null>) {
    const cars = carsRef.current;
    
    cars.forEach(car => {
        const lightState = car.street === Street.VERTICAL ? trafficControllerRef.current?.stateV : trafficControllerRef.current?.stateH;
        let shouldStop = false;
        let forceStop = false; 
        let slowDown = false; 
        const currentPos = car.mesh.position;
        const carDirection = new THREE.Vector3();
        car.mesh.getWorldDirection(carDirection);
        carDirection.normalize(); 

        // 1. DETERMINE OBSTACLES (Stop Line or Car Ahead)
        let distToStopLine = 999;
        if (car.street === Street.VERTICAL) distToStopLine = currentPos.z - STOP_LINE_V;
        else distToStopLine = currentPos.x - STOP_LINE_H;

        // Is the stop line relevant? (Moving towards it and light is RED/YELLOW)
        let stopLineRelevant = false;
        if (distToStopLine > 0 && distToStopLine < 120) {
            if (lightState === TrafficLightState.RED || lightState === TrafficLightState.YELLOW) {
                stopLineRelevant = true;
            }
        }

        // Check for cars ahead via Raycaster
        car.raycaster.set(currentPos, carDirection);
        // Intersect with other cars bodies
        const intersects = car.raycaster.intersectObjects(cars.filter(c => c !== car).map(c => c.mesh.children[0]));
        let distToCarAhead = 999;
        if (intersects.length > 0) {
            distToCarAhead = intersects[0].distance;
        }

        // 2. DECIDE BRAKING
        
        // Anti-Collision / Queuing Logic
        // We want to stop if distToCarAhead < QUEUE_DISTANCE (7.5)
        if (distToCarAhead < QUEUE_DISTANCE) {
            forceStop = true; // Hard stop to prevent clipping
        } else if (distToCarAhead < 30) {
            // Approaching car ahead, try to overtake or slow down
            if (!car.isChangingLane && distToStopLine > 40 && distToCarAhead > 15) {
                // Try Overtake
                const targetLane = car.lane === 0 ? 1 : 0;
                const jump = (car.street === Street.VERTICAL) 
                  ? (targetLane === 1 ? LANE_WIDTH : -LANE_WIDTH)
                  : (targetLane === 1 ? -LANE_WIDTH : LANE_WIDTH);
                  
                const checkPos = currentPos.clone();
                if (car.street === Street.VERTICAL) checkPos.x += jump;
                else checkPos.z += jump;

                if (isLaneSpaceFree(cars, car.street, targetLane, checkPos, 30, 30)) {
                    car.isChangingLane = true;
                    car.targetLane = targetLane;
                    car.laneChangeProgress = 0;
                    car.laneChangeDirection = (targetLane > car.lane) ? 1 : -1;
                } else {
                    slowDown = true;
                    if(distToCarAhead < 20) shouldStop = true;
                }
            } else {
                 // Just queue up
                 slowDown = true;
                 if(distToCarAhead < 15) shouldStop = true;
            }
        }

        // Stop Line Logic
        if (stopLineRelevant) {
            // We want to stop exactly at distToStopLine = 0 (minus a bit for visual center)
            // But we must respect car ahead if it is closer
            if (distToStopLine < 5) shouldStop = true; // Stop right at line
            else if (distToStopLine < 30) slowDown = true;
        }
        
        // 3. APPLY MOVEMENT
        
        // Lane Changing
        if (car.isChangingLane) {
            car.laneChangeProgress += dt * 1.5; 
            if (car.laneChangeProgress >= 1) {
                car.laneChangeProgress = 1;
                car.isChangingLane = false;
                car.lane = car.targetLane;
            }
            
            let lateralSpeed = 0;
            if (car.street === Street.VERTICAL) {
                const targetX = (car.targetLane === 0 ? LANE_WIDTH/2 : LANE_WIDTH*1.5);
                const dx = targetX - car.mesh.position.x;
                lateralSpeed = dx * 2.0; 
                car.mesh.position.x += lateralSpeed * dt;
                car.mesh.rotation.y = Math.PI + (lateralSpeed * -0.05); 
            } else {
                const targetZ = (car.targetLane === 0 ? -LANE_WIDTH/2 : -LANE_WIDTH*1.5);
                const dz = targetZ - car.mesh.position.z;
                lateralSpeed = dz * 2.0;
                car.mesh.position.z += lateralSpeed * dt;
                car.mesh.rotation.y = -Math.PI/2 + (lateralSpeed * 0.05);
            }
            if (car.laneChangeProgress >= 0.95) {
                 if (car.street === Street.VERTICAL) car.mesh.rotation.y = Math.PI;
                 else car.mesh.rotation.y = -Math.PI/2;
            }
        } else {
             if (car.street === Street.VERTICAL) car.mesh.rotation.y = Math.PI;
             else car.mesh.rotation.y = -Math.PI/2;
        }

        // Forward Velocity
        if (forceStop) {
             car.velocity.set(0, 0, 0);
             car.stopped = true;
        } else if (shouldStop) {
            car.velocity.multiplyScalar(0.85); 
            if (car.velocity.length() < 0.5) car.velocity.set(0,0,0);
            car.stopped = true;
        } else if (slowDown) {
            const targetVelocity = carDirection.clone().multiplyScalar(10); 
            car.velocity.lerp(targetVelocity, 0.1);
            car.stopped = false;
        } else {
            const targetVelocity = new THREE.Vector3().copy(carDirection).multiplyScalar(car.speed);
            car.velocity.lerp(targetVelocity, 0.05); 
            car.stopped = false;
        }

        car.mesh.position.add(car.velocity.clone().multiplyScalar(dt));
    });
}

function cleanupCars(scene: THREE.Scene, carsRef: React.MutableRefObject<Car[]>) {
    const threshold = ROAD_LENGTH / 2 + 10;
    const keptCars: Car[] = [];
    
    carsRef.current.forEach(car => {
        const pos = car.mesh.position;
        if (Math.abs(pos.x) > threshold || Math.abs(pos.z) > threshold) {
            scene.remove(car.mesh);
        } else {
            keptCars.push(car);
        }
    });
    
    carsRef.current = keptCars;
}

function countCarsInSensors(carsRef: React.MutableRefObject<Car[]>) {
    let countV = 0;
    let countH = 0;
    
    // Vertical Sensor: Z from 20 to 60 (approx based on sensor zone pos 40 and length 40 centered)
    const vMin = SENSOR_ZONE_V_POS - SENSOR_ZONE_LENGTH / 2; // 20
    const vMax = SENSOR_ZONE_V_POS + SENSOR_ZONE_LENGTH / 2; // 60
    
    // Horizontal Sensor: X from 20 to 60
    const hMin = SENSOR_ZONE_H_POS - SENSOR_ZONE_LENGTH / 2; // 20
    const hMax = SENSOR_ZONE_H_POS + SENSOR_ZONE_LENGTH / 2; // 60

    carsRef.current.forEach(car => {
        if (car.street === Street.VERTICAL) {
            if (car.mesh.position.z > vMin && car.mesh.position.z < vMax) {
                countV++;
            }
        } else if (car.street === Street.HORIZONTAL) {
             if (car.mesh.position.x > hMin && car.mesh.position.x < hMax) {
                countH++;
            }
        }
    });

    return { countV, countH };
}
