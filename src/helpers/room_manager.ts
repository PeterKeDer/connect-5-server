import { GameRoom } from "../models/game_room";
import { GameRoomSettings } from "../models/game_room_settings";

export class RoomManager {
  static shared = new RoomManager();

  rooms: GameRoom[] = [
    new GameRoom('ok', new GameRoomSettings()),
  ];

  createRoom(roomId: string, settings: GameRoomSettings): GameRoom {
    const room = new GameRoom(roomId, settings);
    this.rooms.push(room);
    return room;
  }

  findRoomById(roomId: string): GameRoom | undefined {
    return this.rooms.find((room) => room.id === roomId);
  }

  getPublicRooms(): GameRoom[] {
    return this.rooms.filter((room) => room.settings.isPublic);
  }

  removeRoom(room: GameRoom) {
    const index = this.rooms.indexOf(room);
    if (index !== -1) {
      this.rooms.splice(index, 1);
    }
  }
}
