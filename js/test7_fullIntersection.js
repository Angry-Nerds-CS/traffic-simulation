
const userCanDropObjects=true;
var drawVehIDs=true; // debug: draw veh IDs for selected roads
var drawRoadIDs=true; // debug: draw veh IDs for selected roads
var showCoords=true;  // show logical coords of nearest road to mouse pointer
                  // definition => showLogicalCoords(.) in canvas_gui.js




//#############################################################
// adapt/override most relevant settings
// including standard param settings from control_gui.js
//#############################################################

// button/choicebox controlled vars 

// callback "changeTrafficRules needs ready roads etc->not here
var trafficRules=0; // {priority,symmetric,traffic lights}
var cycleTL=50; // 50 seconds
var greenMain=33; 
var dt_lastSwitch=0;


var laneCountMin=2;
var laneCountMax=5;
var nLanes_main=2;
var nLanes_sec=1;

var laneCount=nLanes_main+nLanes_sec; // state used in addLane(.)
  if(laneCount===laneCountMax){
    document.getElementById("lanePlusDiv").style.visibility="hidden";
  }
  if(laneCount===laneCountMin){
    document.getElementById("laneMinusDiv").style.visibility="hidden";
  }


// slider-controlled vars definined in control_gui.js

qIn=390./3600; // 1000 inflow to both directional main roads
q2=220./3600;   // 300 inflow to secondary (subordinate) roads
fracRight=0.; // fracRight [0-1] of drivers on road 2 turn right
fracLeft=0; // rest of q2-drivers cross straight ahead

IDM_v0=15;
IDM_a=2.0;
timewarp=3.5;

var mainroadLen=200;              // reference size in m

var laneWidth=3.0; 
var car_length=5;    // car length in m (all a bit oversize for visualisation)
var car_width=2.5;     // car width in m
var truck_length=10;
var truck_width=3; 

// left-turning radius sufficiently high to allow for "US left-turning style"

var radiusLeft=4.5*laneWidth; // artifacts if radiusLeft-radiusRight too large
var radiusRight=2.5*laneWidth;

// ###################################################
commaDigits=0;

setSlider(slider_qIn, slider_qInVal, 3600*qIn, commaDigits, "veh/h");
setSlider(slider_q2, slider_q2Val, 3600*q2, commaDigits, "veh/h");
setSlider(slider_IDM_v0, slider_IDM_v0Val, 3.6*IDM_v0, 0, "km/h");
setSlider(slider_IDM_a, slider_IDM_aVal, IDM_a, 1, "m/s<sup>2</sup>");
setSlider(slider_timewarp, slider_timewarpVal, timewarp, 1, " times");
setSlider(slider_fracRight, slider_fracRightVal, 100*fracRight, 0, " %");
setSlider(slider_fracLeft, slider_fracLeftVal, 100*fracLeft, 0, " %");

fracTruck=0.;

/*######################################################
 Global overall scenario settings and graphics objects
  NOTICE: canvas has strange initialization of width=300 in firefox 
  and DOS when try sizing in css (see there) only => always works following:
  document.getElementById("contents").clientWidth; .clientHeight;
######################################################*/


console.log("\n\nstart main: test1_straight");

var simDivWindow=document.getElementById("contents");
var canvas = document.getElementById("canvas"); 
var ctx = canvas.getContext("2d"); // graphics context
canvas.width  = simDivWindow.clientWidth; 
canvas.height  = simDivWindow.clientHeight;

console.log("before addTouchListeners()");
addTouchListeners();
console.log("after addTouchListeners()");


// init overall scaling (if fitfactor>1 => road begins/ends visible)

var fitfactor=1.00;
var refSizePhys=fitfactor*mainroadLen*canvas.height/canvas.width;
var isSmartphone=mqSmartphone();  // from css; only influences text size


// these two must be updated in updateDimensions (aspectRatio != const)

var refSizePix=canvas.height;     // corresponds to pixel size of smaller side
var scale=refSizePix/refSizePhys; // global scale


var aspectRatio=canvas.width/canvas.height;

var hasChanged=true;              // window dimensions have changed

// (hasChangedPhys=true only legacy for main scenarios)


function updateDimensions(){ // if viewport->canvas or sizePhys changed

  refSizePix=canvas.height;     // corresponds to pixel size of smaller side
  scale=refSizePix/refSizePhys;
  
  if(true){
    console.log("updateDimensions: canvas.width=",canvas.width,
		" canvas.height=",canvas.height,
		" aspectRatio=",aspectRatio.toFixed(2),
		" isSmartphone=",isSmartphone,
		" ");
  }
}

//####################################################################
// Global graphics specification
//####################################################################


var drawBackground=true; // if false, default unicolor background
var drawRoad=true;       // if false, only vehicles are drawn
var vmin_col=0;          // for the speed-dependent color-coding of vehicles
var vmax_col=0.7*IDM_v0;


//####################################################################
// Images
//####################################################################


// init background image

var background = new Image();
background.src ='figs/backgroundGrass.jpg'; 
 

// init vehicle image(s)

carImg = new Image();
carImg.src = 'figs/blackCarCropped.gif';
truckImg = new Image();
truckImg.src = 'figs/truck1Small.png';


// init traffic light images

traffLightRedImg = new Image();
traffLightRedImg.src='figs/trafficLightRed_affine.png';
traffLightGreenImg = new Image();
traffLightGreenImg.src='figs/trafficLightGreen_affine.png';


//define obstacle image names

obstacleImgNames = []; // srcFiles[0]='figs/obstacleImg.png'
obstacleImgs = []; // srcFiles[0]='figs/obstacleImg.png'
for (var i=0; i<10; i++){
  obstacleImgs[i]=new Image();
  obstacleImgs[i].src = (i==0)
    ? "figs/obstacleImg.png"
    : "figs/constructionVeh"+(i)+".png";
  obstacleImgNames[i] = obstacleImgs[i].src;
}

// init road images for 1 to 4 lanes

roadImgWith_lane = []; // road with lane separating line
roadImgWithout_lane = []; // road without lane separating line

for (var i=0; i<4; i++){
  roadImgWith_lane[i]=new Image();
  roadImgWith_lane[i].src="figs/road"+(i+1)+"lanesCropWith.png";
  roadImgWithout_lane[i]=new Image();
  roadImgWithout_lane[i].src="figs/road"+(i+1)+"lanesCropWithout.png";

  console.log("i=",i," roadImgWith_lane[i].src=",roadImgWith_lane[i].src);
}



//##################################################################
//<NETWORK>
// Specification of physical road network and vehicle geometry
// If viewport or refSizePhys changes => updateDimensions();
//##################################################################

// all relative "Rel" settings with respect to refSizePhys, not refSizePix!


var center_xRel=0.50;   // 0: left, 1: right
var center_yRel=-0.50;  // -1: bottom; 0: top
var center_xPhys=center_xRel*refSizePhys*aspectRatio; //[m]
var center_yPhys=center_yRel*refSizePhys;

defineGeometricVariables(nLanes_main,nLanes_sec);


//#########################################################
// def main trajectories 
//#########################################################

function traj0_x(u){ // physical coordinates
  return center_xPhys+u-0.5*road0Len;
}
function traj0_y(u){ 
  return center_yPhys-offsetMain;
}

function traj1_x(u){ // physical coordinates
  return center_xPhys-(u-0.5*road0Len);
}
function traj1_y(u){ 
  return center_yPhys+offsetMain;
}


function traj2_x(u){ 
  return center_xPhys+offsetSec;
}
function traj2_y(u){ 
  return center_yPhys-offset20Target-radiusRight-road2Len+u;
}


function traj3_x(u){ 
  return center_xPhys+offsetSec;
}
function traj3_y(u){ 
  return center_yPhys-offset20Target-radiusRight+u;
}


function traj4_x(u){ 
  return center_xPhys-offsetSec;
}
function traj4_y(u){ 
  return center_yPhys+offset20Target+radiusRight+road4Len-u;
}


function traj5_x(u){ 
  return center_xPhys-offsetSec;
}
function traj5_y(u){ 
  return center_yPhys+offset20Target+radiusRight-u;
}


var traj=[ [traj0_x,traj0_y], [traj1_x,traj1_y], [traj2_x,traj2_y],
	   [traj3_x,traj3_y], [traj4_x,traj4_y], [traj5_x,traj5_y] ];

//#################################################################
// special trajectories for the right turns on the target roads 0,1,3,5
// routes 20,41,13,05
//#################################################################



// special traj as template for the route 20 for road 0

// dr=difference between target road center and center of target lane
// since traj always with resp to road center but I want r with resp to
// single-lane right turn (target since special lane atatched to target)

function trajRight_x(u,dr){ 
  var urel=u-u20Target; // long coord target relative to start of transition

  // center of the arc for the right turn from right to right lane
  
  var x0=center_xPhys+offset20Source+radiusRight;
  var y0=center_yPhys-offset20Target-radiusRight;

  // dr=distance of target lane (right) to target road axis

  // case distinction since for veh rotation u-vehLen/2 relevant)

  var x=(urel<0)
      ? x0-(radiusRight+dr)
      : x0-(radiusRight+dr)*Math.cos(urel/radiusRight);

  if(false){
    console.log("traj0_20x: t=",time.toFixed(2),
	      " umin=",road0.trajAlt[0].umin.toFixed(1),
	      " umax=",road0.trajAlt[0].umax.toFixed(1),
	      " u=",u.toFixed(1),
		" urel=",urel," x0=",x0," traj2_x(0)=",traj2_x(0));
  }
  return x;
}


function trajRight_y(u,dr){ // special coordinate for the route 20 for road 0
  var urel=u-u20Target;
  var y0=center_yPhys-offset20Target-radiusRight;
  var y=(urel<0)
      ? y0+urel
      : y0+(radiusRight+dr)*Math.sin(urel/radiusRight);
  return y;
}


function traj0_20x(u){return trajRight_x(u,offset20Target-offsetMain);}
function traj0_20y(u){return trajRight_y(u,offset20Target-offsetMain);}

function traj1_41x(u){return 2*center_xPhys-traj0_20x(u);}
function traj1_41y(u){return 2*center_yPhys-traj0_20y(u);}


function traj3_13x(u){
  return trajRight_x(lenRight-u+u20Target+u13Target,offset20Source-offsetSec);
}
function traj3_13y(u){
  return 2*center_yPhys
    -trajRight_y(lenRight-u+u20Target+u13Target,offset20Source-offsetSec);
}

function traj5_05x(u){return 2*center_xPhys-traj3_13x(u);}
function traj5_05y(u){return 2*center_yPhys-traj3_13y(u);}


//#################################################################
// special trajectories for the left turns on the target roads 0,1,3,5
// routes 40,21,03,15
//#################################################################

// template for the route 21 for road 1

function trajLeftSecMain_x(u,dr){

  var straightSec=lenLeftSecMain-lenLeft;  // first straight, then left turn

  var x0=center_xPhys+offset21Source-radiusLeft;
  var y0=center_yPhys+offset21Target-radiusLeft;

  var urel=u-u21Target; // long coord target relative to start of transition

  // dr=distance of target lane (left) to target road axis

  var x=(urel<straightSec) // dr=distance target lane to target road axis
      ? x0+(radiusLeft+dr)
      : x0+(radiusLeft+dr)*Math.cos((urel-straightSec)/radiusLeft);
  return x;
}

function trajLeftSecMain_y(u,dr){
  var straightSec=lenLeftSecMain-lenLeft;
  var y0=center_yPhys+offset21Target-radiusLeft;
  var urel=u-u21Target; 
  var y=(urel<straightSec) // dr=distance target lane to target road axis
      ? y0+urel-straightSec
      : y0+(radiusLeft+dr)*Math.sin((urel-straightSec)/radiusLeft);
  return y;
}

// different traj: from main to sec only arc, from sec to main straight
// section needed because secondary road ends before the arc

function trajLeftMainSec_x(u,dr){ //  template for 03
  var x0=center_xPhys+offset21Source-radiusLeft;
  var urel=u-u03Target; 
  var x=(urel<0) 
      ? x0+urel
      : x0+(radiusLeft+dr)*Math.sin(urel/radiusLeft);
  return x;
}

function trajLeftMainSec_y(u,dr){ //  template for 03
  var y0=center_yPhys-offset21Target+radiusLeft;
  var urel=u-u03Target; 
  var y=(urel<0) 
      ? y0-(radiusLeft+dr)
      : y0-(radiusLeft+dr)*Math.cos(urel/radiusLeft);
  return y;
}


function traj1_21x(u){return trajLeftSecMain_x(u,offsetMain-offset21Target);}
function traj1_21y(u){return trajLeftSecMain_y(u,offsetMain-offset21Target);}

function traj0_40x(u){return 2*center_xPhys-traj1_21x(u);}
function traj0_40y(u){return 2*center_yPhys-traj1_21y(u);}

function traj3_03x(u){return trajLeftMainSec_x(u,offsetSec-offset21Source);}
function traj3_03y(u){return trajLeftMainSec_y(u,offsetSec-offset21Source);}
//function traj3_03x(u){return trajLeftMainSec_x(u,5);}
//function traj3_03y(u){return trajLeftMainSec_y(u,5);}

function traj5_15x(u){return 2*center_xPhys-traj3_03x(u);}
function traj5_15y(u){return 2*center_yPhys-traj3_03y(u);}



// #############################################################3
// road images for the trajectories; 2 images per road/network element
// #############################################################3

var roadImages=[];
for(var ir=0; ir<traj.length; ir++){
  roadImages[ir]=[];
  for(var j=0; j<2; j++){roadImages[ir][j]=new Image();}
}





//##################################################################
// Specification of logical road network: constructing the roads
//##################################################################


var fracTruckToleratedMismatch=1.0; // 1=100% allowed=>changes only by sources
var speedInit=20;
density=0;
var isRing=false;
var roadIDs=[0,1,2,3,4,5];

var route00=[roadIDs[0]];                // mainE-straight
var route05=[roadIDs[0], roadIDs[5]]; // mainE-right
var route03=[roadIDs[0], roadIDs[3]]; // mainE-left
var route11=[roadIDs[1]];                // mainW-straight
var route13=[roadIDs[1], roadIDs[3]]; // mainW-right
var route15=[roadIDs[1], roadIDs[5]]; // mainW-left
var route20=[roadIDs[2], roadIDs[0]];
var route21=[roadIDs[2], roadIDs[1]];
var route23=[roadIDs[2], roadIDs[3]];
var route40=[roadIDs[4], roadIDs[0]];
var route41=[roadIDs[4], roadIDs[1]];
var route45=[roadIDs[4], roadIDs[5]];




// roads
// last opt arg "doGridding" left out (true:user can change road geometry)

var road0=new road(roadIDs[0],road0Len,laneWidth,nLanes_main,
		   traj[0],
		   density, speedInit,fracTruck, isRing);

var road1=new road(roadIDs[1],road1Len,laneWidth,nLanes_main,
		   traj[1],
		   density, speedInit,fracTruck, isRing);

var road2=new road(roadIDs[2],road2Len,laneWidth,nLanes_sec,
		   traj[2],
		   density, speedInit,fracTruck, isRing);

var road3=new road(roadIDs[3],road3Len,laneWidth,nLanes_sec,
		   traj[3],
		   density, speedInit,fracTruck, isRing);

var road4=new road(roadIDs[4],road4Len,laneWidth,nLanes_sec,
		   traj[4],
		   density, speedInit,fracTruck, isRing);

var road5=new road(roadIDs[5],road5Len,laneWidth,nLanes_sec,
		   traj[5],
		   density, speedInit,fracTruck, isRing);




// road network (network declared in canvas_gui.js)

network=[road0,road1,road2,road3,road4,road5];

// draw veh IDs on selected links if set true; also draw alternative traject

for(var ir=0; ir<network.length; ir++){
  network[ir].drawVehIDs=drawVehIDs;
  network[ir].drawAlternativeTrajectories=true;
}


defineGeometricRoadproperties(nLanes_main,nLanes_sec);

defineConflicts(nLanes_main,nLanes_sec,trafficRules);



// add standing virtual vehicles at the end of some road elements
// prepending=unshift (strange name)
// vehicle(length, width, u, lane, speed, type)

//var virtualStandingVeh
//    =new vehicle(2, laneWidth, road0.roadLen-0.5*laneWidth, 1, 0, "obstacle");

//road0.veh.unshift(virtualStandingVeh);


var detectors=[]; // stationaryDetector(road,uRel,integrInterval_s)
//detectors[0]=new stationaryDetector(road0,0.20*road0Len,10);
//detectors[1]=new stationaryDetector(road0,0.80*road0Len,10);



//</NETWORK>


//#########################################################
// model initialization (models and methods defined in control_gui.js)
//#########################################################
	
// ok 2021. Defines longModelCar,-Truck,LCModelCar,-Truck,-Mandatory
updateModels(); 




//############################################
// traffic objects and traffic-light control editor
//############################################

// TrafficObjects(canvas,nTL,nLimit,xRelDepot,yRelDepot,nRow,nCol)
var trafficObjs=new TrafficObjects(canvas,4,2,0.25,0.25,2,4);
var TL=trafficObjs.trafficObj.slice(0,4);  // last index not included
// set two TL to green, two to red

// !! Editor not yet finished
// (then args xRelEditor,yRelEditor not relevant unless editor shown)
var trafficLightControl=new TrafficLightControlEditor(trafficObjs,0.5,0.5);



//############################################
// run-time specification and functions
//############################################

var time=0;
var itime=0;
var fps=30; // frames per second (unchanged during runtime)
var dt=timewarp/fps;


function debugVeh(id){
  for(var ir=0; ir<network.length; ir++){
    for(var i=0; i<network[ir].veh.length; i++){
      if(network[ir].veh[i].id==id){
	  var veh=network[ir].veh[i];
        console.log("time=",time.toFixed(2), "itime=",itime,
		      "status of veh id=",veh.id,
		      " u=",veh.u.toFixed(1),
		    " lane=",veh.lane," v=",veh.v.toFixed(2),
		    " speed=",veh.speed.toFixed(1),
		    " acc=",veh.acc.toFixed(1),
		     // " veh=",veh,
		     "");
	}
    }
  }
}

  
//#################################################################
function updateSim(){
//#################################################################

  //if((itime==182)||(itime==183)){console.log("0:"); debugVeh(211);}


  
  
  // updateSim (1): update time, global geometry, and traffic objects

  time +=dt; // dt depends on timewarp slider (fps=const)
  itime++;
  hasChanged=false;

   // updateSim (0): update traffic light state if signalzed intersection

  dt_lastSwitch+=dt;
  if(trafficRules==1){
    if((TL[0].value=="green")&&(dt_lastSwitch>greenMain)
       ||(TL[0].value=="red")&&(dt_lastSwitch>cycleTL-greenMain)){
      nextTLphase();
      dt_lastSwitch=0;
    }
  }


  
  if ((canvas.width!=simDivWindow.clientWidth)
      ||(canvas.height != simDivWindow.clientHeight)){
    hasChanged=true;
    canvas.width  = simDivWindow.clientWidth;
    canvas.height  = simDivWindow.clientHeight;

    if(isSmartphone!=mqSmartphone()){
      isSmartphone=mqSmartphone();
    }

    updateDimensions(); // updates refsizePhys, -Pix, scale, geometry
 
    trafficObjs.calcDepotPositions(canvas);
  }
 
  if(userCanDropObjects&&(!isSmartphone)&&(!trafficObjPicked)){
    trafficObjs.zoomBack(); // here more responsive than in drawSim
  }


  // updateSim (2): integrate all the GUI actions (sliders, TrafficObjects)
  // as long as not done independently (clicks on vehicles)
  // check that global var deepCopying=true (in road.js)
  // (needed for updateModelsOfAllVehicles)

  // LCModelMandatory in control_gui.js;
  // road.updateM... makes road.LCModelMandatoryLeft, -Right out of this

  for(var ir=0; ir<network.length; ir++){
    network[ir].updateTruckFrac(fracTruck, fracTruckToleratedMismatch);
    network[ir].updateModelsOfAllVehicles(longModelCar,longModelTruck,
					 LCModelCar,LCModelTruck,
					 LCModelMandatory);
    network[ir].updateSpeedlimits(trafficObjs);
  }
  


  // updateSim (3): do central acc calculation of vehicles
  // (may be later overridden by special actions before speed and pos update)

  for(var ir=0; ir<network.length; ir++){
    network[ir].calcAccelerations();
  }


  // updateSim (4): !!! do all the network actions
  // (inflow, outflow, merging and connecting)


  // (4a) inflow BC
  
  var qEastbound=0.95*qIn;
  var qWestbound=1.05*qIn;
  var qNorthbound=0.95*q2;
  var qSouthbound=1.05*q2;

  // direction={0: straight, 1: right, 2: left}
  var r=Math.random();
  var direction=(r<=fracRight) ? 1 : (r<fracRight+fracLeft) ? 2 : 0;

  var routes0=[route00,route05,route03]; // E-bound - straight-right-left
  var routes1=[route11,route13,route15]; // W - straight-right-left
  var routes2=[route23,route20,route21]; // N - straight-right-left
  var routes4=[route45,route41,route40]; // S - straight-right-left

  network[0].updateBCup(qEastbound,dt,routes0[direction]);
  
  r=Math.random(); direction=(r<=fracRight) ?1:(r<fracRight+fracLeft) ?2:0;
  network[1].updateBCup(qWestbound,dt,routes1[direction]);
			
  r=Math.random(); direction=(r<=fracRight) ?1:(r<fracRight+fracLeft) ?2:0;
  network[2].updateBCup(qNorthbound,dt,routes2[direction]);
			
  r=Math.random(); direction=(r<=fracRight) ?1:(r<fracRight+fracLeft) ?2:0;
  network[4].updateBCup(qSouthbound,dt,routes4[direction]);

   
  // updateSim (4b) mergeDiverge actions

  
  // updateSim (4c): direct connecting stuff
  // connectors selected by the route of the vehicles
  // connect(targetRoad,uSource,uTarget,offsetLane,conflicts(opt),speed(opt))

  var maxspeed_turn=7;
  

  // straight  ahead (network[0], [1] need no
  // straight connecting, route=only one link)

  network[2].connect(network[3], network[2].roadLen,
		     0, 0, conflicts23);
  
  network[4].connect(network[5], network[4].roadLen,
		     0, 0, conflicts45);


  // turn right

  network[0].connect(network[5], u05Source, u05Target,
		     nLanes_sec-nLanes_main, conflicts05,
		     maxspeed_turn, false);

  network[1].connect(network[3], u13Source, u13Target,
		     nLanes_sec-nLanes_main, conflicts13,
		     maxspeed_turn, false);

  network[2].connect(network[0], u20Source, u20Target,
		     nLanes_main-nLanes_sec, conflicts20,
		     maxspeed_turn, true);
  
  network[4].connect(network[1], u41Source, u41Target, 
		     nLanes_main-nLanes_sec, conflicts41,
		     maxspeed_turn, true);

  // turn left (arg after maxspeed is targetPrio)

  network[0].connect(network[3], u03Source, u03Target, 
		     0, conflicts03, maxspeed_turn, false);

  network[1].connect(network[5], u15Source, u15Target, 
		     0, conflicts15, maxspeed_turn, false);

 
  network[2].connect(network[1], u21Source, u21Target,
		     0, conflicts21, maxspeed_turn, true);
  
  network[4].connect(network[0], u40Source, u40Target,
		     0, conflicts40, maxspeed_turn, true);


  // updateSim (4d): outflow BC (if not relevant, updateBCdown does nothing)

  for(var ir=0; ir<network.length; ir++){
    network[ir].updateBCdown();
  }

 
  // updateSim (5): 
  // restrict LC for inflowing road2-vehicles for route 20
  // (update speed and move vehs at the end because of changed acc)
  
  for(var ir=0; ir<network[0].veh.length; ir++){
    if(arraysEqual(network[0].veh[ir].route, [0,5])){
      network[0].veh[ir].LCModel=network[0].LCModelMandatoryRight;
    }
    if(arraysEqual(network[0].veh[ir].route, [0,3])){
      network[0].veh[ir].LCModel=network[0].LCModelMandatoryLeft;
    }
  }

  for(var ir=0; ir<network[1].veh.length; ir++){
    if(arraysEqual(network[1].veh[ir].route, [1,3])){
      network[1].veh[ir].LCModel=network[1].LCModelMandatoryRight;
    }
    if(arraysEqual(network[1].veh[ir].route, [1,5])){
      network[1].veh[ir].LCModel=network[1].LCModelMandatoryLeft;
    }
  }

  for(var ir=0; ir<network[2].veh.length; ir++){
    if(arraysEqual(network[2].veh[ir].route, [2,0])){
      network[2].veh[ir].LCModel=network[2].LCModelMandatoryRight;
    }
    if(arraysEqual(network[2].veh[ir].route, [2,1])){
      network[2].veh[ir].LCModel=network[2].LCModelMandatoryLeft;
    }
 }

  for(var ir=0; ir<network[4].veh.length; ir++){
    if(arraysEqual(network[4].veh[ir].route, [4,1])){
      network[4].veh[ir].LCModel=network[4].LCModelMandatoryRight;
    }
    if(arraysEqual(network[4].veh[ir].route, [4,0])){
      network[4].veh[ir].LCModel=network[4].LCModelMandatoryLeft;
    }
  }

  for(var ir=0; ir<network.length; ir++){
    network[ir].changeLanes();         
    network[ir].updateLastLCtimes(dt);
  }


  for(var ir=0; ir<network.length; ir++){ // simult. update pos at the end
    network[ir].updateSpeedPositions();
  }


    // updateSim (6): update detector readings

  for(var iDet=0; iDet<detectors.length; iDet++){
    detectors[iDet].update(time,dt);
  }


  //if(itime==526){alert("stopDebug");}
}//updateSim




//##################################################
function drawSim() {
//##################################################

  //if(itime==182){console.log("begin drawsim:"); debugVeh(211);}

  var movingObserver=false; // relative motion works, only start offset
  var speedObs=2;
  var uObs=speedObs*time;

  // drawSim (1): adapt text size
 
  var relTextsize_vmin=(isSmartphone) ? 0.03 : 0.02;
  var textsize=relTextsize_vmin*Math.min(canvas.width,canvas.height);



  // drawSim (2): reset transform matrix and draw background
  // (only needed if changes, plus "reminders" for lazy browsers)
  // haschanged def/updated here,
  // mousedown/touchdown in canvas_gui objectsZoomBack in TrafficObjects
  
  ctx.setTransform(1,0,0,1,0,0);
  if(drawBackground){
    var objectsMoved=(mousedown ||touchdown ||objectsZoomBack);
    if(hasChanged||objectsMoved||(itime<=10) || (itime%50==0)
       || (!drawRoad) || movingObserver||drawVehIDs){
      ctx.drawImage(background,0,0,canvas.width,canvas.height);
    }
  }
  

  // drawSim (3): draw road network
  
  //var changedGeometry=hasChanged||(itime<=1); 
  var changedGeometry=(itime<=1); // if no physical change of road lengths

  // road.draw(img1,img2,scale,changedGeometry,
  //           umin,umax,movingObserver,uObs,center_xPhys,center_yPhys)
  // second arg line optional, only for moving observer

  for(var ir=network.length-1; ir>=0; ir--){ // draw second. roads first
    network[ir].draw(roadImages[ir][0],roadImages[ir][1],
		     scale,changedGeometry);
  }

  if(drawRoadIDs){  
    for(var ir=0; ir<network.length; ir++){
      network[ir].drawRoadID(scale);
    }
  }

  
  // drawSim (4): draw vehicles

  // road.drawVehicles(carImg,truckImg,obstImgs,scale,vmin_col,vmax_col,
  //           umin,umax,movingObserver,uObs,center_xPhys,center_yPhys)
  // second arg line optional, only for moving observer

  for(var ir=0; ir<network.length; ir++){ 
    network[ir].drawVehicles(carImg,truckImg,obstacleImgs,scale,
			vmin_col,vmax_col);
  }


  // drawSim (5): redraw changeable traffic objects
  // (zoomback is better in sim!)

  if(userCanDropObjects&&(!isSmartphone)){
    trafficObjs.draw(scale);
  }

  ctx.setTransform(1,0,0,1,0,0); 
  drawSpeedlBox(); // draw speedlimit-change select box


  // drawSim (6): show simulation time and detector displays

  displayTime(time,textsize);
  for(var iDet=0; iDet<detectors.length; iDet++){
	detectors[iDet].display(textsize);
  }

  // drawSim (7): show logical coordinates if activated

  if(showCoords&&mouseInside){
    showLogicalCoords(xPixUser,yPixUser);
  }
  
  //if(itime==182){console.log("end drawsim:"); debugVeh(211);}

} // drawSim

 



//##################################################
// Running function of the sim thread (triggered by setInterval)
//##################################################

function main_loop() {
  //console.log("main_loop: time=",time," itime=",itime);
  updateSim();
  drawSim();
}
 

 //############################################
// start the simulation thread
// THIS function does all the things; everything else 
// only functions/definitions
// triggers:
// (i) automatically when loading the simulation 
// (ii) when pressing the start button in *gui.js
//  ("myRun=setInterval(main_loop, 1000/fps);")
//############################################

console.log("first main execution");

var myRun=setInterval(main_loop, 1000/fps);

//##################################################
// special gui callbacks (not so general to be in control_gui.js)
//##################################################

// address each TL individually because otherwise (just flipping state)
// consequential errors ("all 4 red or green") not caught

function nextTLphase(){
  console.log("in nextTLphase: TL[0].value=",TL[0].value);
  if(TL[0].value=="green") for(var i=0; i<4; i++){
    trafficObjs.setTrafficLight(TL[i], (i<2) ? "red" : "green");
  }
  else for(var i=0; i<4; i++){
    trafficObjs.setTrafficLight(TL[i], (i<2) ? "green" : "red");
  }
}



function changeTrafficRules(ruleIndex){
  trafficRules=ruleIndex;
  defineConflicts(nLanes_main,nLanes_sec,trafficRules);
  
  if(trafficRules==1){ // traffic lights
    nextTLphase(); // to bring traffic lights in defined state: 2 green/red


    trafficObjs.dropObject(TL[0],network,
		       network[0].traj[0](u05Source),
		       network[0].traj[1](u05Source),
		       20,scale);
    trafficObjs.dropObject(TL[1],network,
		       network[1].traj[0](u05Source),
		       network[1].traj[1](u05Source),
		       20,scale);
    trafficObjs.dropObject(TL[2],network,
		       network[2].traj[0](u20Source),
		       network[2].traj[1](u20Source),
		       20,scale);
    trafficObjs.dropObject(TL[3],network,
		       network[4].traj[0](u20Source),
		       network[4].traj[1](u20Source),
			   20,scale);
    console.log("changeTrafficRules: u05Source=",u05Source," u20Source=",u20Source);
  }
  else{
    for(var i=0; i<4; i++){
      trafficObjs.deactivate(TL[i]);
      //TL[i].inDepot=true;
    }
  }
}
    



function setTotalLaneNumber(laneCount){ 
  userCanvasManip=true; // causes drawing background
  nLanes_main=Math.min(laneCount-1,3);
  nLanes_sec=laneCount-nLanes_main;

    
  defineGeometricVariables(nLanes_main,nLanes_sec);
  defineGeometricRoadproperties(nLanes_main,nLanes_sec);
  defineConflicts(nLanes_main,nLanes_sec,trafficRules);

  
  // sometimes ref error with active TLs on roads if the roads are redefined
  // ("new) in myRestartFunction() and the TLs just repositioned
  // by changeTrafficRules(rulesOld). It's safe to deactivate the TLs before
  // and activate them again at the new positions on the new roads
  // once constructed by myRestartFunction()

  var rulesOld=trafficRules;
  if(rulesOld==1){changeTrafficRules(0); }
  
  myRestartFunction();
  
  
  if(rulesOld==1){
    //changeTrafficRules(0);  
    changeTrafficRules(rulesOld); // changes back integer trafficRules
  }
}

function setOD(index){
  if(index==0){fracRight=0; fracLeft=0;}
  else if(index==1){fracRight=1; fracLeft=0;}
  else if(index==2){fracRight=0; fracLeft=1;}
  else{fracRight=0.3; fracLeft=0.3;}
}

//###############################################################
// define or update top-level lane-dependent variables
// (mainroadLen and refSizePhys=smaller edge define global scale
// at the very beginning, !=f(lanes)
// cannot define with "var" because called at the beginning and
// after changing lane numbers
//###############################################################

function defineGeometricVariables(nLanes_main,nLanes_sec){
  offsetMain=0.5*laneWidth*nLanes_main;
  offsetSec=0.5*laneWidth*nLanes_sec;
  offset20Target=(nLanes_main-0.5)*laneWidth; // dist from inters. y center
  road0Len=mainroadLen; 
  road2Len=0.5/fitfactor*refSizePhys - offset20Target - radiusRight;
  road3Len=0.5/fitfactor*refSizePhys + offset20Target + radiusRight;

//right

  lenRight=0.5*Math.PI*radiusRight; // for all right-turn special traj
  offset20Source=(nLanes_sec-0.5)*laneWidth; // dist from inters. x center
  u20Source=1.0*road2Len;
  u20Target=0.5*mainroadLen+offset20Source+(1-0.5*Math.PI)*radiusRight;
  u13Source=0.5*mainroadLen-offset20Source-radiusRight;
  u13Target=2*(offset20Target+radiusRight)-lenRight;

//left

  lenLeft=0.5*Math.PI*radiusLeft; //main-sec
  lenLeftSecMain=lenLeft+2*offsetMain-1*(radiusLeft-radiusRight);
  
  offset21Source=0.5*laneWidth;  // dist from intersection x center
  offset21Target=0.5*laneWidth;  // dist from intersection y center
  u21Source=1.0*road2Len;
  u21Target=0.5*mainroadLen-offset21Source+radiusLeft-lenLeftSecMain;
  u03Source=0.5*mainroadLen+offset21Source-radiusLeft;
  u03Target=-offset21Target+radiusLeft+radiusRight+offset20Target-lenLeft;


// dependent quantities due to symmetry

  road1Len=mainroadLen;
  road4Len=road2Len;
  road5Len=road3Len;

  u41Source=u20Source;
  u41Target=u20Target;
  u05Source=u13Source;
  u05Target=u13Target;

  u40Source=u21Source;
  u40Target=u21Target;
  u15Source=u03Source;
  u15Target=u03Target;
}


 
  // update non-function road properties (these are not by reference)

function defineGeometricRoadproperties(nLanes_main,nLanes_sec){

  var nLanes=[nLanes_main,nLanes_main,
	    nLanes_sec,nLanes_sec,nLanes_sec,nLanes_sec];
  for(var ir=0; ir<nLanes.length; ir++){
      roadImages[ir][0]=roadImgWith_lane[nLanes[ir]-1];
      roadImages[ir][1]=roadImgWithout_lane[nLanes[ir]-1];
      network[ir].nLanes=(ir<2) ? nLanes_main : nLanes_sec;
  }

  road2.roadLen=road2Len;
  road3.roadLen=road3Len;
  road4.roadLen=road4Len;
  road5.roadLen=road5Len;

// adding the alternative trajectories ([0]=right turn, [1]=left turn)
// depending on the roadID of the route link neighboring to the road
// to which the alt traj are added

  road0.trajAlt[0]={x: traj0_20x,
		  y: traj0_20y,
		  roadID: 2, // here only route 20
		  umin:u20Target,
		  umax:u20Target+lenRight,
		  laneMin:nLanes_main-1, // right main lane
		  laneMax:nLanes_main-1
		 };
  
  road0.trajAlt[1]={x: traj0_40x,
		  y: traj0_40y,
		  roadID: 4,   // route40,
		  umin:u40Target,
		  umax:u40Target+lenLeftSecMain,
		  laneMin:0, // left main lane
		  laneMax:0
		 };

  road1.trajAlt[0]={x: traj1_41x,
		  y: traj1_41y,
		  roadID: 4,   // route41,
		  umin:u41Target,
		  umax:u41Target+lenRight,
		  laneMin:nLanes_main-1, // right main lane
		  laneMax:nLanes_main-1
		 };
  
  road1.trajAlt[1]={x: traj1_21x,
		  y: traj1_21y,
		  roadID: 2,   // route21,
		  umin:u21Target,
		  umax:u21Target+lenLeftSecMain,
		  laneMin:0, // left main lane
		  laneMax:0
		 };
  

  road3.trajAlt[0]={x: traj3_13x,
		  y: traj3_13y,
		  roadID: 1,    // route13,
		  umin:u13Target,
		  umax:u13Target+lenRight,
		  laneMin:nLanes_sec-1, // right secondary lane
		  laneMax:nLanes_sec-1
		 };
  
  road3.trajAlt[1]={x: traj3_03x,
		  y: traj3_03y,
		  roadID: 0,    // route03,
		  umin:u03Target,
		  umax:u03Target+lenLeft,
		  laneMin:0, // left secondary lane
		  laneMax:0
		 };
  
  road5.trajAlt[0]={x: traj5_05x,
		  y: traj5_05y,
		  roadID: 0,     // route05,
		  umin:u05Target,
		  umax:u05Target+lenRight,
		  laneMin:nLanes_sec-1, // right secondary lane
		  laneMax:nLanes_sec-1
		 };
  
  road5.trajAlt[1]={x: traj5_15x,
		  y: traj5_15y,
		  roadID: 1,     //route15,
		  umin:u15Target,
		  umax:u15Target+lenLeft,
		  laneMin:0, // left secondary lane
		  laneMax:0
		   };
  
}




/* #################################################################
Defining the conflicts in connecting one link to the next
Conflict components:
.roadConflict: the (external) road causing the potential conflict
.dest:         filters destinations for the external vehicles 
               possibly leading to a conflict. []=all, [0,3]: dest 0 and 3
.uConflict:    conflict point for the filtered external vehicles
.uOwnConflict: conflict point for the vehicles on the subject road

@param nLanes_main,nLanes_sec: The conflict points depend 
                               on the number of lanes
@param trafficRules: 0: unsignalized with East-West priority road
                     2: unsignalized, right priority
                     1: signalized
Since left-turners also have conflicting paths, some conflicts remain also
in the presence of traffic lights (just keeping the conflicts will lead to
gridlocks since secondary road users always "fear" that the waiting 
mainroad vehicles start off)

Note: all conflicts are filtered for the ODs in the simulation, e.g.,
var conflicts21=[conflict0_up, conflict4_21,conflict5_21];


###################################################################
*/

function defineConflicts(nLanes_main,nLanes_sec,trafficRules){


  if(trafficRules==0){defineConflictsPriorityRoad(nLanes_main,nLanes_sec);}
  else if(trafficRules==1){
    defineConflictsTrafficLights(nLanes_main,nLanes_sec);}
  else{defineConflictsSymmetric(nLanes_main,nLanes_sec);}
}

// set of conflicts for priority/secondary roads for all subject ODs

//################################################################
function defineConflictsPriorityRoad(nLanes_main,nLanes_sec){
//################################################################
  
  setBasicConflicts(nLanes_main,nLanes_sec);
  
  // right

  conflicts05=[];  
  conflicts13=[];
  conflicts20=[];
  conflicts41=[];

  // straight ahead

  conflicts00=[];
  conflicts11=[];
  conflicts23=[conflict0_up,conflict1_up];
  conflicts45=[conflict0_down,conflict1_down];

  // left

  conflicts03=[conflict1_03];
  conflicts15=[conflict0_15];
  conflicts21=[conflict0_up, conflict4_21,conflict5_21];
  conflicts40=[conflict1_down,conflict2_40,conflict3_40]; 
}


// conflicts only for the four left-turning ODs

//################################################################
function defineConflictsTrafficLights(nLanes_main,nLanes_sec){
//################################################################

  setBasicConflicts(nLanes_main,nLanes_sec);

  // right

  conflicts05=[];  
  conflicts13=[];
  conflicts20=[];
  conflicts41=[];

  // straight ahead

  conflicts00=[];
  conflicts11=[];
  conflicts23=[];
  conflicts45=[];

  // left

  conflicts03=[conflict1_03];
  conflicts15=[conflict0_15];
  conflicts21=[conflict4_21,conflict5_21];
  conflicts40=[conflict2_40,conflict3_40]; 

  
}



//!!!! not yet implemented

//###########################################################
function defineConflictsSymmetric(nLanes_main,nLanes_sec){
//###########################################################
  
  setBasicConflicts(nLanes_main,nLanes_sec);
  
  // conflict2_00,conflic3_00 not yet defined, also not connect to itself
  // in actual simulation

  // right

  conflicts05=[];  
  conflicts13=[];
  conflicts20=[];
  conflicts41=[];

  // straight ahead (symmetric right priority)

  conflicts00=[conflict2_00,conflic3_00];
  conflicts11=[conflict4_11,conflic5_11];
  conflicts23=[conflict1_up];
  conflicts45=[conflict0_down];

  // left

  conflicts03=[conflict1_03,conflict2_03];
  conflicts15=[conflict0_15,conflict4_15];
  conflicts21=[conflict4_21,conflict5_21];
  conflicts40=[conflict2_40,conflict3_40]; 
  
}


//################################################################
function setBasicConflicts(nLanes_main,nLanes_sec){
//################################################################

  // (1) conflicts by mainroads for straight ahead OD from secondary roads
  // and by opposite mainroad for secondary left-turners

  
  conflict0_up=  {roadConflict: network[0], 
		    dest:         [0,3], //straight-on and left turners
		    uConflict:    0.5*network[0].roadLen+offsetSec,
		    uOwnConflict: radiusRight+offset20Target-offsetMain};

  conflict0_down={roadConflict: network[0],
		    dest:         [], // all
		    uConflict:    0.5*network[0].roadLen-offsetSec,
		    uOwnConflict: radiusRight+offset20Target+offsetMain};

// symmetry

  conflict1_down={roadConflict: network[1],
		    dest:         [1,5],
		    uConflict:    conflict0_up.uConflict,
		    uOwnConflict: conflict0_up.uOwnConflict};

  conflict1_up=  {roadConflict: network[1],
		    dest:         [],
		    uConflict:    conflict0_down.uConflict,
		    uOwnConflict: conflict0_down.uOwnConflict};

  

  // (2) conflicts by opposite mainroad for mainroad left-turners

  conflict0_15= {roadConflict: network[0],  //by road 0 for OD 15
		   dest:         [0,5], // US style: only main-straight/right
		   uConflict:    0.5*network[0].roadLen-offsetSec,
		   uOwnConflict: radiusRight+offsetMain};

  // symmetry

  conflict1_03= {roadConflict: network[1], //by road 1 for OD 03
		   dest:         [1,3], // only main straight-on and right
		   uConflict:    conflict0_15.uConflict,
		   uOwnConflict: conflict0_15.uOwnConflict};

	   

  // (3) conflicts by the secondary roads straight traffic
  // for secondary left turners of the other direction
  // anticipation -> roads 2/4 needed as well since
  //roads 3/5 starts too near the conflict (u>roadLen OK)

  conflict3_40={roadConflict: network[3],  // By road 3 for OD 40
		  dest:         [],        // road 3 is only sink road
		  uConflict:    offset20Target+radiusRight-offsetMain,
		  uOwnConflict: offset20Target+radiusRight+offsetMain};


  conflict2_40={roadConflict: network[2],  // By road 2 for OD 40
		  dest:         [0,3],     // right priority+US style left
		  uConflict:    network[2].roadLen+conflict3_40.uConflict,
		  uOwnConflict: conflict3_40.uOwnConflict};

  // symmetry

  conflict5_21={roadConflict: network[5],  // By road 5 for OD 21
		  dest:         [],        
		  uConflict:    conflict3_40.uConflict,
		  uOwnConflict: conflict3_40.uOwnConflict};

  conflict4_21={roadConflict: network[4], // By road 4 for OD 21
		  dest:         [1,5],    
		  uConflict:    conflict2_40.uConflict,
		  uOwnConflict: conflict2_40.uOwnConflict};

}
