import { UserObject } from './models/user';

type RoomEvent = UserRoomEvent | BasicRoomEvent;

type UserRoomEvent = {
  description: 'user-joined' | 'user-left' | 'user-set-restart' | 'user-disconnected' | 'user-reconnected',
  user: UserObject,
  role: number,
};

type BasicRoomEvent = {
  description: 'start-game' | 'step-added' | 'game-ended' | 'game-reset',
};

const Events = {
  failToJoin: 'fail-to-join',
  failToAddStep: 'fail-to-add-step',
  roomUpdated: 'room-updated',
};

const UserEvents = {
  addStep: 'add-step',
  restartGame: 'restart-game',
  leaveGame: 'leave-game',
};

export {
  RoomEvent,
  Events,
  UserEvents,
};
