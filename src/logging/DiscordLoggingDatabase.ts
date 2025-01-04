import { LoggingEditor, LoggingTarget, PrismaClient } from "@prisma/client";

const prisma: PrismaClient = new PrismaClient();

export async function getLogging(player: number): Promise<LoggingTarget[]> {
  return await prisma.loggingTarget.findMany({
    where: {
      player: player,
    },
  });
}

export async function getEdit(
  player: number,
  name: string
): Promise<LoggingEditor | null> {
  return await prisma.loggingEditor.findFirst({
    where: {
      player: player,
      name: name,
    },
  });
}

export async function renameEdits(
  player: number,
  oldName: string,
  newName: string
) {
  await prisma.loggingEditor.updateMany({
    where: {
      player: player,
      name: oldName,
    },
    data: {
      name: newName,
    },
  });
}

export async function addUpdateEdit(edit: LoggingEditor) {
  if (edit.id != null) {
    return await prisma.loggingEditor.update({
      where: { id: edit.id },
      data: {
        name: edit.name,
        identifier: edit.identifier,
        created: edit.created,
        lastUse: edit.lastUse,
        melting: edit.melting,
      },
    });
  } else {
    return await prisma.loggingEditor.create({
      data: {
        player: edit.player,
        name: edit.name,
        identifier: edit.identifier,
        created: edit.created,
        lastUse: edit.lastUse,
        melting: edit.melting,
      },
    });
  }
}

export async function addUpdateLogging(
  logging: LoggingTarget
): Promise<LoggingTarget> {
  if (logging.id != null) {
    return await prisma.loggingTarget.update({
      where: {
        id: logging.id,
      },
      data: {
        identifier: logging.identifier,
        target: logging.target,
        targetData: logging.targetData,
        displayname: logging.displayname,
        avatar: logging.avatar,
        created: logging.created,
        lastUse: logging.lastUse,
        uses: logging.uses,
      },
    });
  } else {
    return await prisma.loggingTarget.create({
      data: {
        player: logging.player,
        identifier: logging.identifier,
        target: logging.target,
        targetData: logging.targetData,
        displayname: logging.displayname,
        avatar: logging.avatar,
        created: logging.created,
        lastUse: logging.lastUse,
        uses: logging.uses,
      },
    });
  }
}

export async function removeLogging(loggingId: number) {
  await prisma.loggingTarget.delete({ where: { id: loggingId } });
}

export async function removeEdit(id: number) {
  await prisma.loggingEditor.delete({
    where: { id: id },
  });
}
