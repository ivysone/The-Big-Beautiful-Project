import { Start } from './scenes/Start.js';
import { LevelOne } from './scenes/LevelOne.js';
import { LevelTwo } from './scenes/LevelTwo.js';

const config = {
    type: Phaser.AUTO,
    title: 'Overlord Rising',
    description: '',
    parent: 'game-container',
    width: 1280,
    height: 720,
    backgroundColor: '#000000',
    pixelArt: true,
    scene: [
        LevelTwo,
        LevelOne,
        Start
    ],
    scale: {
        mode: Phaser.Scale.ENVELOP,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
    default: 'matter',
    matter: {
        gravity: {y: 1},
        debug: false
        }
    }
}

new Phaser.Game(config);
            