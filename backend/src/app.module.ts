import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { GridModule } from "./grid/grid.module";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), GridModule],
  controllers: [AppController],
})
export class AppModule {}
