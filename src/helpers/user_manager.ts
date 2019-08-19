import { User } from '../models/user';
import { GameRoom, GameRoomRole } from '../models/game_room';

export type PendingUser = {
  user: User;
  room: GameRoom;
  role: GameRoomRole;
}

type PendingUserAndStatus = {
  status: 'pending' | 'disconnected';
  user: PendingUser;
} | { status: 'timeout' };

export class UserManager {
  static shared = new UserManager();

  static PENDING_USER_TIMEOUT = 1000 * 10;
  static DISCONNECTED_USER_TIMEOUT = 1000 * 60;

  pendingUsers: PendingUser[] = [];
  disconnectedUsers: PendingUser[] = [];

  /// Get the pending or disconnected user, or timeout if they have already been removed
  getPendingUserAndStatus(userId: string): PendingUserAndStatus {
    const pendingUser = this.pendingUsers.find((pendingUser) => pendingUser.user.id === userId);
    if (pendingUser !== undefined) {
      return {
        status: 'pending',
        user: pendingUser,
      };
    }

    const disconnectedUser = this.disconnectedUsers.find((disconnectedUser) => disconnectedUser.user.id === userId);
    if (disconnectedUser !== undefined) {
      return {
        status: 'disconnected',
        user: disconnectedUser,
      };
    }

    return {
      status: 'timeout',
    };
  }

  /// Add a user to disconnected users, and will be automatically removed after a delay
  addPendingUser(user: User, room: GameRoom, role: GameRoomRole, removedHandler: () => void) {
    this.pendingUsers.push({ user, room, role });

    // Make user leave the room after a delay
    setTimeout(() => {
      if (this.removeFromDisconnected(user.id)) {
        removedHandler();
      }
    }, UserManager.PENDING_USER_TIMEOUT);
  }

  /// Removes a user from pending users if it exists. Returns true if a user is removed, otherwise false
  removeFromPending(userId: string): boolean {
    const index = this.pendingUsers.findIndex((user) => user.user.id === userId);
    if (index !== -1) {
      this.pendingUsers.splice(index, 1);
      return true;
    }
    return false;
  }

  /// Add a user to disconnected users, and will be automatically removed after a delay
  addDisconnectedUser(user: User, room: GameRoom, role: GameRoomRole, removedHandler: () => void) {
    this.disconnectedUsers.push({ user, room, role });

    // Make user leave the room after a delay
    setTimeout(() => {
      if (this.removeFromDisconnected(user.id)) {
        removedHandler();
      }
    }, UserManager.DISCONNECTED_USER_TIMEOUT);
  }

  /// Removes a user from disconnected users if it exists. Returns true if a user is removed, otherwise false
  removeFromDisconnected(userId: string): boolean {
    const index = this.disconnectedUsers.findIndex((user) => user.user.id === userId);
    if (index !== -1) {
      this.disconnectedUsers.splice(index, 1);
      return true;
    }
    return false;
  }
}
