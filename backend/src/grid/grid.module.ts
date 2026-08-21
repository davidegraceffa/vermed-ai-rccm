import { Module } from "@nestjs/common";
import { CooldownService } from "./cooldown.service";
import { GridGateway } from "./grid.gateway";
import { GridService } from "./grid.service";

@Module({
  providers: [GridGateway, GridService, CooldownService],
})
export class GridModule {}
