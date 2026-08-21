import { Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { CooldownService } from "./cooldown.service";
import { UpdateCellAck, UpdateCellDto } from "./dto/update-cell.dto";
import { GridService } from "./grid.service";
import { isValidCellStatus } from "./types/cell-status.enum";

/**
 * Simplified auth for the prototype: the frontend generates a random id,
 * persists it in localStorage, and sends it as the socket handshake `auth`
 * payload. There is no verification that the id belongs to a real account
 * -- it only lets us key the cooldown map per "user" across reconnects.
 * A production system would replace this with a verified session/JWT and
 * read the user id from it instead of trusting the client. See
 * docs/ARCHITECTURE.md.
 */
// origin: true reflects whatever Origin the browser sends, which is fine
// for this local/prototype deployment (frontend and backend only ever run
// on localhost or inside the same docker-compose network). It intentionally
// isn't read from an env var: @WebSocketGateway's options are evaluated
// when this file is first imported, which happens before ConfigModule.forRoot()
// has run and populated process.env from .env. A production build would
// lock this to a real allow-list, sourced from process.env directly (which
// IS populated in time when a container/host injects it before Node starts)
// rather than through ConfigModule.
@WebSocketGateway({
  cors: { origin: true, credentials: true },
})
export class GridGateway
  implements OnGatewayConnection, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(GridGateway.name);

  @WebSocketServer()
  server!: Server;

  /**
   * The spec's "~333 accepted updates/sec at peak" is a ceiling the accept
   * path (cooldown check + write below) needs to clear, not a rate we
   * broadcast at 1:1. Emitting one socket.io message per accepted update to
   * every connected client would mean 333 * connectedClients messages/sec
   * at that peak -- the actual bottleneck, not the O(1) map/array writes.
   * So accepted updates are buffered here (deduped per cell -- only the
   * latest status in a window matters) and flushed as one batched event on
   * an interval, decoupling accept throughput from broadcast frequency.
   */
  private readonly pendingBroadcast = new Map<
    number,
    { x: number; y: number; status: number }
  >();
  private flushInterval?: ReturnType<typeof setInterval>;
  private readonly batchIntervalMs: number;

  constructor(
    private readonly grid: GridService,
    private readonly cooldown: CooldownService,
    private readonly config: ConfigService,
  ) {
    this.batchIntervalMs = Number(
      this.config.get("BROADCAST_BATCH_MS", "75"),
    );
  }

  onModuleInit(): void {
    this.flushInterval = setInterval(
      () => this.flushBroadcastBatch(),
      this.batchIntervalMs,
    );
  }

  onModuleDestroy(): void {
    clearInterval(this.flushInterval);
  }

  private flushBroadcastBatch(): void {
    if (this.pendingBroadcast.size === 0) return;
    const batch = Array.from(this.pendingBroadcast.values());
    this.pendingBroadcast.clear();
    this.server.emit("grid:cells-updated", batch);
  }

  handleConnection(client: Socket): void {
    const userId =
      (client.handshake.auth?.["userId"] as string | undefined) ?? client.id;
    client.data.userId = userId;

    client.emit("grid:snapshot", {
      width: this.grid.width,
      height: this.grid.height,
      cells: this.grid.snapshot(),
    });

    this.logger.log(`Client connected: ${client.id} (user ${userId})`);
  }

  @SubscribeMessage("grid:update-cell")
  handleUpdateCell(
    @MessageBody() dto: UpdateCellDto,
    @ConnectedSocket() client: Socket,
  ): UpdateCellAck {
    const userId = client.data.userId as string;

    if (!this.grid.isInBounds(dto.x, dto.y)) {
      return { accepted: false, reason: "OUT_OF_BOUNDS" };
    }

    if (!isValidCellStatus(dto.status)) {
      return { accepted: false, reason: "INVALID_STATUS" };
    }

    const remainingMs = this.cooldown.getRemainingCooldownMs(userId);
    if (remainingMs > 0) {
      return {
        accepted: false,
        reason: "COOLDOWN_ACTIVE",
        retryAfterMs: remainingMs,
      };
    }

    this.grid.setCell(dto.x, dto.y, dto.status);
    this.cooldown.recordAccepted(userId);

    const cell = { x: dto.x, y: dto.y, status: dto.status };
    this.pendingBroadcast.set(dto.y * this.grid.width + dto.x, cell);

    return { accepted: true, cell };
  }
}
