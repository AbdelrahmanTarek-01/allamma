import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'fs';
import { join } from 'path';
import { IdeasService } from './rooms/ideas.service';
import { RoomsGateway } from './rooms/rooms.gateway';
import { RoomsService } from './rooms/rooms.service';

@Controller('api')
class HealthController {
  constructor(private readonly rooms: RoomsService) {}

  @Get('health')
  health() {
    return { ok: true, ...this.rooms.stats() };
  }
}

/** Plain-text liveness for Render's health check and keep-alive pings (no logging, no state). */
@Controller()
class LivenessController {
  @Get('health')
  alive() {
    return 'ok';
  }
}

@Module({ controllers: [HealthController, LivenessController], providers: [RoomsService, IdeasService, RoomsGateway] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });

  // In production the built client is served by this same server (one free Render service).
  const clientDir = process.env.CLIENT_DIR || join(__dirname, '..', '..', 'client', 'dist');
  if (existsSync(clientDir)) {
    app.useStaticAssets(clientDir, { maxAge: '1h', index: false });
    const indexFile = join(clientDir, 'index.html');
    app.getHttpAdapter().getInstance().get(/^\/(?!api|health|socket\.io).*/, (_req: any, res: any) => res.sendFile(indexFile));
  }

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Allamma server on :${port}${existsSync(clientDir) ? ' (serving client)' : ''}`);
}
bootstrap();
