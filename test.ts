const trilateration = require("trilateration");

const pos = trilateration([
  { x: 0, y: 0, distance: 3.5 },
  { x: 5, y: 0, distance: 4.2 },
  { x: 2.5, y: 4, distance: 3.1 }
]);

console.log("Resultado de trilateración:", pos);
