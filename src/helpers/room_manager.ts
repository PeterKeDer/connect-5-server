import { GameRoom } from "../models/game_room";
import { GameRoomSettings } from "../models/game_room_settings";

export class RoomManager {
  static shared = new RoomManager();

  rooms: GameRoom[] = [
    new GameRoom('ok', new GameRoomSettings()),
  ];

  findRoomById(roomId: string): GameRoom | undefined {
    return this.rooms.find((room) => room.id === roomId);
  }

  getPublicRooms(): GameRoom[] {
    return this.rooms.filter((room) => room.settings.isPublic);
  }

  addRoom(room: GameRoom) {
    this.rooms.push(room);
  }

  removeRoom(room: GameRoom) {
    const index = this.rooms.indexOf(room);
    if (index !== -1) {
      this.rooms.splice(index, 1);
    }
  }
}
