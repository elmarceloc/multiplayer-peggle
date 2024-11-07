// Set up the Matter.js engine and renderer
const { Engine, Render, Runner, World, Bodies, Events, Mouse, Body, MouseConstraint, Composite } = Matter;
const socket = io('http://200.58.103.58:5050');

const engine = Engine.create();
const { world } = engine;
const width = 800;
const height = 600;
const pegRadius = 10;
let started = false;
engine.gravity.y = 0.5;

let currentLevel = 0;
let pegs = [];
let ballCount = 9;
let ballInPlay = false;
let playerId = '';

let platformDirection = 1;
let movingPlatform;
const platformSpeed = 3;

const render = Render.create({
    element: document.body,
    engine: engine,
    options: {
        width,
        height,
        wireframes: false,
        background: 'transparent'
    }
});

Render.run(render);
const runner = Runner.create();
Runner.run(runner, engine);

// Socket.io event handlers
socket.on('connect', () => {
    playerId = socket.id;
});

socket.on('gameStart', () => {
    started = true;

    //reset platform position
    movingPlatform.position.x = width / 2
    movingPlatform.position.y = height - 20
    platformDirection = 1;
});

socket.on('ballLaunched', (data) => {
    if (playerId !== data.playerId) {
        launchBallForOpponent(data.angle);
    }
});

// Add boundaries (left, right, and bottom)
const walls = [
    Bodies.rectangle(50, height / 2, 50, height, { isStatic: true, visible: false, render: { fillStyle: 'rgba(255, 0, 0, 0.5)' } }),
    Bodies.rectangle(width - 55, height / 2, 50, height, { isStatic: true, visible: false, render: { fillStyle: 'rgba(255, 0, 0, 0.5)' } })
];
World.add(world, walls);

// Add moving platform
movingPlatform = Bodies.rectangle(width / 2, height - 20, 100, 20, {
    isStatic: true,
    isSensor: true,
    render: {
        sprite: {
            texture: 'assets/img/hole.png'
        }
    }
});

World.add(world, movingPlatform);
  // render the level
  levels[currentLevel].forEach((peg, index) => {
      const isToucheable = ((index * 31 + 23) % 47) % 3 === 1;  // More complex pseudo-random pattern
      if (peg.type === 'circle') {
          const pegObj = Bodies.circle(
              peg.x,
              peg.y,
              pegRadius,
              {
                  isStatic: true,
                  isTouched: false,
                  isToucheable: isToucheable,
                  render: {
                      sprite: {
                          texture: isToucheable ? 'assets/img/pegs/red.png' : 'assets/img/pegs/blue.png'
                      }
                  }
              }
          );
          pegs.push(pegObj);
          World.add(world, pegObj);
      } else if (peg.type === 'hidden_rectangle') {
          const pegObj = Bodies.rectangle(
              peg.x,
              peg.y,
              peg.width,
              peg.height,
              {
                  isStatic: true,
                  angle: peg.rotation * Math.PI / 180,
                  render: {
                      visible: false,
                      fillStyle: '#ff0000'
                  }
              }
          );
          World.add(world, pegObj);
      }
  });
Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach((collision) => {
        const bodyA = collision.bodyA;
        const bodyB = collision.bodyB;

        const peg = pegs.includes(bodyA) ? bodyA : (pegs.includes(bodyB) ? bodyB : null);
        const ball = bodyA.isBall ? bodyA : (bodyB.isBall ? bodyB : null);

        if ((bodyA === movingPlatform || bodyB === movingPlatform) && ball && ball.isMyBall) {
            ballCount++;
            updateBallCount();
            
            const freeball2Sound = new Audio('assets/audio/freeball2.ogg');
            freeball2Sound.play();
        }

        if (peg && !peg.isTouched) {
            peg.isTouched = true;

            const pegHitSound = new Audio('assets/audio/peghit_low.ogg');
            pegHitSound.play();

            if (peg.isToucheable) {
                peg.render.sprite.texture = 'assets/img/pegs/red_touched.png';
            } else {
                peg.render.sprite.texture = 'assets/img/pegs/blue_touched.png';
            }
        }
    });
});

Events.on(engine, 'afterUpdate', () => {
    const edgeDistance = 50;
    let speedMultiplier = 1;

    if (movingPlatform.position.x > width - 155) {
        platformDirection = -1;
    } else if (movingPlatform.position.x < 150) {
        platformDirection = 1;
    }

    if (movingPlatform.position.x > width - 205) {
        speedMultiplier = (width - 155 - movingPlatform.position.x) / edgeDistance;
    } else if (movingPlatform.position.x < 200) {
        speedMultiplier = (movingPlatform.position.x - 150) / edgeDistance;
    }

    speedMultiplier = Math.max(0.1, Math.min(1, speedMultiplier));

    Body.setPosition(movingPlatform, {
        x: movingPlatform.position.x + (platformSpeed * platformDirection * speedMultiplier),
        y: movingPlatform.position.y
    });

    const bodies = Composite.allBodies(engine.world);
    bodies.forEach(body => {
        if (body.position.y > height) {
            World.remove(world, body);
            if (body.isMyBall) {
                ballInPlay = false;
            }

            let delay = 500;
            pegs.forEach((peg, index) => {
                if (peg.isTouched) {
                    setTimeout(() => {
                        const pegPopSound = new Audio('assets/audio/pegpop.ogg');
                        pegPopSound.play();
                        World.remove(world, peg);
                        pegs.splice(pegs.indexOf(peg), 1);
                    }, delay);
                    delay += 100;
                }
            });
            
            socket.emit('endTurn');
        }
    });
});

function updateBallCount() {
    const ballCountDisplay = document.getElementById('ballCount');
    ballCountDisplay.textContent = ballCount;
}

updateBallCount();

Events.on(engine, 'afterRender', () => {
    updateBallCount();
});

function launchBall(angle) {
    if (ballCount <= 0 || ballInPlay) return;

    const ball = Bodies.circle(width / 2, 50, 7, {
        restitution: 1,
        isBall: true,
        isMyBall: true,
        render: {
            sprite: {
                texture: 'assets/img/ball.png',
                xScale: 1,
                yScale: 1
            }
        }
    });

    const force = 0.005;
    const forceX = Math.cos(angle) * force;
    const forceY = Math.sin(angle) * force;

    const audio = new Audio('assets/audio/cannonshot.ogg');
    audio.play();

    World.add(world, ball);
    Body.applyForce(ball, ball.position, { x: forceX, y: forceY });
    ballCount--;
    ballInPlay = true;
    updateBallCount();

    socket.emit('ballLaunched', { angle, playerId });
}

function launchBallForOpponent(angle) {
    const ball = Bodies.circle(width / 2, 50, 7, {
        restitution: 1,
        isBall: true,
        isMyBall: false,
        render: {
            sprite: {
                texture: 'assets/img/ball.png',
                xScale: 1,
                yScale: 1
            }
        }
    });

    const force = 0.005;
    const forceX = Math.cos(angle) * force;
    const forceY = Math.sin(angle) * force;

    const audio = new Audio('assets/audio/cannonshot.ogg');
    audio.play();

    World.add(world, ball);
    Body.applyForce(ball, ball.position, { x: forceX, y: forceY });
}

document.addEventListener('click', (event) => {
    if (!started) return;
    const centerX = width / 2;
    const startY = 50;
    const angle = Math.atan2(event.clientY - startY, event.clientX - centerX);
    launchBall(angle);
});

const pointer = document.getElementById('pointer');
const centerX = width / 2 - 30;
const centerY = 50;
const radius = 70;

document.addEventListener('mousemove', (event) => {
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const angle = Math.atan2(dy, dx);
    
    const pointerX = centerX + radius * Math.cos(angle);
    const pointerY = centerY + radius * Math.sin(angle);
    
    pointer.style.transform = `translate(${pointerX}px, ${pointerY}px) rotate(${angle - Math.PI/2}rad)`;
});

const codeInput = document.getElementById('roomCode');
codeInput.addEventListener('change', (event) => {
    const roomCode = event.target.value;
    const audio = new Audio('assets/audio/button.ogg');
    audio.play();
    socket.emit('joinRoom', roomCode);
});
codeInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        const roomCode = event.target.value;
        const audio = new Audio('assets/audio/button.ogg');
        audio.play();
        socket.emit('joinRoom', roomCode);
    }
});