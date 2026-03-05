import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

(async () => {
    // 1. 현재 YC AZALEA를 조회
    const v = await prisma.vessel.findFirst({ where: { alias: 'YC AZALEA' } });
    if (v) {
        console.log('Found YC AZALEA:', v);
        // MMSI를 다시 440323000로 되돌리고, Name도 강제로 YC AZALEA로 세팅.
        await prisma.vessel.update({
            where: { id: v.id },
            data: {
                mmsi: '440323000',
                name: 'YC AZALEA',
                infoFetched: true // Datalastic이 다시 덮어쓰지 않도록 설정
            }
        });
        console.log('Updated YC AZALEA information back to correct ones.');
    } else {
        console.log('YC AZALEA not found.');
    }
    process.exit(0);
})();
