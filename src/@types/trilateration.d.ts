declare module "trilateration" {
  interface BeaconInput {
    x: number;
    y: number;
    distance: number;
  }

  interface Position {
    x: number;
    y: number;
  }

  interface TrilaterationFunction {
    (data: BeaconInput[]): Position;

    vector(x: number, y: number): { x: number; y: number };
    addBeacon(id: number, position: { x: number; y: number }): void;
    setDistance(id: number, distance: number): void;
    calculatePosition(): { x: number; y: number };
    getBeacons(): BeaconInput[];
  }

  const trilateration: TrilaterationFunction;

  export = trilateration;
}
