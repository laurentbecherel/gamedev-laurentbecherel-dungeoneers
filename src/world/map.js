// Map facade — query helpers for DungeonMap
// Delegates room containment to discovery.js single source to avoid duplication
import { getRoomAt as sharedGetRoomAt } from './discovery.js';

export class DungeonMapWrapper {
  constructor(dungeon) { this.d = dungeon; }
  get width(){ return this.d.w; }
  get height(){ return this.d.h; }
  isWalkable(x, y) {
    x=Math.floor(x); y=Math.floor(y);
    if(x<0||y<0||x>=this.d.w||y>=this.d.h) return false;
    return this.d.grid[y*this.d.w+x] === 0;
  }
  getCell(x, y) {
    x=Math.floor(x); y=Math.floor(y);
    if(x<0||y<0||x>=this.d.w||y>=this.d.h) return null;
    const i=y*this.d.w+x;
    return {grid:this.d.grid[i], floorMat:this.d.floorMat[i], ceilMat:this.d.ceilMat[i],
      floorHeight:this.d.floorHeight[i], ceilHeight:this.d.ceilHeight[i], deco:this.d.deco[i]};
  }
  getRoomAt(x, y) {
    return sharedGetRoomAt(x, y, this.d);
  }
  getStartPos(){ return {x:this.d.startX, y:this.d.startY}; }
  getRoomsByRole(role){ return this.d.rooms.filter(r=>r.role===role); }
}
