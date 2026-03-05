import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

const targetVessels = [
    { name: 'C. INNOVATOR', color: '#10b981', mmsi: '441205000', imo: '9595618' },
    { name: 'C. MIGHTY', color: '#059669', mmsi: '357245000', imo: '9422158' },
    { name: 'C. GALAXY', color: '#047857', mmsi: '354231000', imo: '9404924' },
    { name: 'GREEN ONE', color: '#a3e635', mmsi: '440384000', imo: '9336660' },
    { name: 'HMM DAON', color: '#d946ef', mmsi: '440880000', imo: '9869227' },
    { name: 'UNIVERSAL WINNER', color: '#f59e0b', mmsi: '440274000', imo: '9837602' },
    { name: 'UNIVERSAL GLORY', color: '#d97706', mmsi: '636023124', imo: '9794824' },
    { name: 'HMM NARAE', color: '#8b5cf6', mmsi: '352006018', imo: '1039278' },
    { name: 'HMM NAMU', color: '#6d28d9', mmsi: '352006280', imo: '1039292' }
];

async function addVessels() {
    console.log('Starting to add new vessels (타사간사)...');

    for (const v of targetVessels) {
        try {
            await prisma.vessel.upsert({
                where: { mmsi: v.mmsi },
                update: {
                    name: v.name,
                    alias: v.name,
                    companyType: '타사간사',
                    color: v.color,
                    imo: v.imo,
                },
                create: {
                    mmsi: v.mmsi,
                    name: v.name,
                    alias: v.name,
                    companyType: '타사간사',
                    color: v.color,
                    imo: v.imo,
                }
            });
            console.log(`✅ Add Success: ${v.name} (MMSI: ${v.mmsi}, IMO: ${v.imo})`);

        } catch (e) {
            console.error(`⚠️ Error processing ${v.name}:`, e.message);
        }
    }
}

addVessels().then(() => prisma.$disconnect());
