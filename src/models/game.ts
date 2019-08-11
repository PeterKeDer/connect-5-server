enum GameError {
  OutOfBounds,
  SpotTaken,
  NoStepsToUndo,
}

enum BoardSpot {
  Empty,
  Black,
  White,
}

enum Side {
  Black = 1,
  White,
}

function toggleSide(side: Side) {
  return side === Side.Black ? Side.White : Side.Black;
}

interface PointObject {
  x: number;
  y: number;
}

class Point {
  constructor(public x: number, public y: number) {}

  equals(point: Point): boolean {
    return this.x === point.x && this.y === point.y;
  }

  toJson(): PointObject {
    return {
      x: this.x,
      y: this.y,
    };
  }
}

type MaybeWinner = WinnerDetails | undefined;

interface WinnerDetailsObject {
  side: number;
  points: PointObject[];
}

class WinnerDetails {
  constructor(public side: Side, public points: Point[]) {}

  toJson(): WinnerDetailsObject {
    return {
      side: this.side.valueOf(),
      points: this.points.map(point => point.toJson()),
    };
  }
}

class Board {
  private spots: BoardSpot[][];

  constructor(public size: number) {
    this.spots = [];
    for (let i = 0; i < size; i++) {
      this.spots.push([]);
      for (let j = 0; j < size; j++) {
        this.spots[i].push(BoardSpot.Empty);
      }
    }
  }

  /// Get the spot at point, throwing OutOfBoardException if point is invalid
  getSpot(point: Point): BoardSpot {
    if (!this.isValid(point)) {
      throw GameError.OutOfBounds;
    }
    return this.spots[point.x][point.y];
  }

  /// Set the spot at point, throwing OutOfBoardException if point is invalid
  setSpot(point: Point, spot: BoardSpot) {
    if (!this.isValid(point)) {
      throw GameError.OutOfBounds;
    }
    this.spots[point.x][point.y] = spot;
  }

  /// Returns whether the board is full (no empty spots remaining)
  get isFull(): boolean {
    return this.spots.every(col => col.every(spot => spot !== BoardSpot.Empty));
  }

  /// Check if point is within the board bounds
  isValid(point: Point): boolean {
    return 0 <= point.x && point.x < this.size && 0 <= point.y && point.y < this.size;
  }
}

interface GameObject {
  size: number;
  initialSide: number;
  currentSide: number;
  steps: PointObject[];
  winner?: WinnerDetailsObject;
}

class Game {
  static WIN_CONSEC_SPOTS = 5;

  board: Board;
  steps: Point[] = [];
  currentSide: Side;

  private shouldRecalculateWinner = true;

  constructor(size: number, public initialSide: Side = Side.Black) {
    this.board = new Board(size);
    this.currentSide = initialSide;
  }

  toJson(): GameObject {
    return {
      size: this.board.size,
      initialSide: this.initialSide.valueOf(),
      currentSide: this.currentSide.valueOf(),
      steps: this.steps.map(point => point.toJson()),
      winner: this.winner === undefined ? undefined : this.winner.toJson(),
    };
  }

  /// Add a step, throws spotTaken error if spot is not empty
  addStep(point: Point) {
    if (this.board.getSpot(point) !== BoardSpot.Empty) {
      throw GameError.SpotTaken;
    }
    const spot = this.currentSide === Side.Black ? BoardSpot.Black : BoardSpot.White;
    this.board.setSpot(point, spot);
    this.steps.push(point);

    this.shouldRecalculateWinner = true;
    this.toggleSide();
  }

  get isFull(): boolean {
    return this.board.isFull;
  }

  private _winner: MaybeWinner;

  /// Get the winner details (cached), if any, Otherwise undefined
  get winner(): MaybeWinner {
    if (this.shouldRecalculateWinner) {
      this._winner = this.getWinner();
      this.shouldRecalculateWinner = false;
    }

    return this._winner;
  }

  private getWinner(): MaybeWinner {
    const boardSize = this.board.size;
    const lines: Point[][] = [];

    for (let i = 0; i < boardSize; i++) {
      // Horizontal lines
      lines.push(this.generate(boardSize, j => new Point(i, j)));

      // Vertical lines
      lines.push(this.generate(boardSize, j => new Point(j, i)));

      // Slope down lines
      lines.push(this.generate(boardSize - i, j => new Point(i + j, j)));
      if (i > 0) {
        lines.push(this.generate(boardSize - i, j => new Point(j, i + j)));
      }

      // Slope up line
      lines.push(this.generate(i + 1, j => new Point(i - j, j)));
      if (i > 0) {
        lines.push(this.generate(boardSize - i, j => new Point(i + j, boardSize - j - 1)));
      }
    }

    // Get the first consecutive side
    return lines.map(line => this.getWinDetails(line)).find(win => win !== undefined);
  }

  private generate(length: number, generator: (n: number) => Point): Point[] {
    return new Array(length).map((_, index) => generator(index));
  }

  /// Check if there are consecutive 5 points with the same side on board
  private getWinDetails(points: Point[]): MaybeWinner {
    if (points.length < Game.WIN_CONSEC_SPOTS) {
      return;
    }

    let prevSpot = BoardSpot.Empty;
    let consec: Point[] = [];

    for (const point of points) {
      const spot = this.board.getSpot(point);

      if (spot === prevSpot && spot !== BoardSpot.Empty) {
        consec.push(point);

        if (consec.length >= Game.WIN_CONSEC_SPOTS) {
          const side = spot === BoardSpot.Black ? Side.Black : Side.White;
          return new WinnerDetails(side, consec);
        }
      } else {
        consec = [point];
        prevSpot = spot;
      }
    }
  }

  get isFinished(): boolean {
    return this.winner !== undefined || this.isFull;
  }

  toggleSide() {
    this.currentSide = toggleSide(this.currentSide);
  }
}

export { Game, GameObject, Point, WinnerDetails, Side, BoardSpot, GameError };
