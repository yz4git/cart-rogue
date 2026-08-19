import "./CartRoguePhase14Arenas";
import "./CartRoguePhase14SurfacePass";
import "./CartRoguePhase15Turbo";
import "./CartRoguePhase22RamSweep";
import "./CartRoguePhase16Flow";
import "./CartRoguePhase17CombatEvolution";
import "./CartRoguePhase19TargetArt";
import "./CartRoguePhase19CreaturePolish";
import "./CartRoguePhase19GroundCover";
import "./CartRoguePhase19GardenPolish";
import "./CartRoguePhase19ReferencePolish";
import "./CartRoguePhase19ArtifactCleanup";
import "./CartRoguePhase20DioramaQuality";
import "./CartRoguePhase20ReferenceMatch";
import "./CartRoguePhase22CameraComfort";
import "./CartRoguePhase21ImpactPolish";
import "./CartRoguePhase21WorldGrade";
import "./CartRoguePhase23GateAndPivot";
import "./CartRoguePhase24GroundMotion";
import "./CartRoguePhase25TurboVisuals";
import "./CartRoguePhase26StageIdentity";
import "./CartRoguePhase27EnemyDamageVisuals";
import "./CartRoguePhase28HeroSurface";
import "./CartRoguePhase29SurfaceLife";
import "./CartRoguePhase30EnemyBreakup";
import "./CartRoguePhase31BossAtmosphere";
import "./CartRoguePhase32NearCameraParticles";
import "./CartRoguePhase33HandlingCombat";
import "./CartRoguePhase34FloorDetail";
import "./CartRoguePhase35MosaicDiorama";
import "./CartRoguePhase36TraversalVisibility";
import "./CartRoadsideVisibility";
import "./CartRoguePhase37MosaicColorPass";
import "./CartRoguePhase39VertexColorPipeline";
import "./CartRoguePhase42StaticInstanceColorRepair";
import "./CartRoguePhase43ArchitectureVertexColors";
import "./CartRoguePhase44RequestedFixes";
import "./CartRoguePhase45StabilityGuidance";
import "./CartExitGuideVisual";
import "./CartRoguePhase46GroundPatternRecovery";
import "./CartRoguePhase47TransitCompletion";
import "./CartRoguePhase48RouteExitCompletion";
import "./CartRoguePhase49HandlingContact";
import "./CartRoguePhase50Arena03CenterClearance";
import "./CartRoguePhase51Arena03Gate";
import "./CartRoguePhase53Handling2";
import "./CartRoguePhase54TurboAttack";
import "./CartTurboAttackVisual";
import "./CartRoguePhase55TurboStrike";
import "./CartRoguePhase56TurboSmash";
import "./CartRoguePhase57FlowSurge";
import "./CartRoguePhase58TurboBreakaway";
import "./CartRoguePhase59TurboStrikeVisual";
import "./CartRoguePhase60TurboCombatSafety";
import "./CartRoguePhase61PerfectStrike";
import "./CartRoguePhase62PerfectShockwave";
import "./CartRoguePhase63TurboAimAssist";
import "./CartRoguePhase64TurboHitStun";
import "./CartRoguePhase65PerfectCombatVisual";
import "./CartRoguePhase66TurboChainReward";
import "./CartRoguePhase67TurboHunt";
import "./CartRoguePhase67HuntRecoveryBounds";
import "./CartRoguePhase74TurboHuntPerkMilestones";
import "./CartRoguePhase78TurboHuntPresentationGuard";
import "./CartRoguePhase79PerformanceBattery";
import "./CartRoguePhase80EnvironmentRichness";
import "./CartRoguePhase81EventDirector2";
import "./CartRoguePhase82ImpactSpeed3";
import "./CartRoguePhase83Boss2";
import "./CartRoguePhase84ThreatDodge";
import "./CartRoguePhase85PursuitEvents";
import "./CartRoguePhase86BossPredator";
import "./CartRoguePhase87ThreatPressure2";
import "./CartRoguePhase88RaidHazards";
import "./CartRoguePhase88RaidHazardVisualAlignment";
import "./CartRoguePhase89HazardCombatDirector";
import "./CartRoguePhase90TitanRaidBoss4";
import "./CartRoguePhase91DamageFeedback2";
import "./CartRoguePhase93ForcedDodgeTrajectory2";
import "./CartRoguePhase94EscapeRhythmDirector2";
import "./CartRaidEvasionCarry";
import "./CartRoguePhase96RaidPressure3";
import "./CartRoguePhase97AdaptiveCounterread";
import "./CartRoguePhase98HardMode";
import "./CartRoguePhase99ResourceReadability";
import "./CartRoguePhase100CasualAnimeWorld";
import "./CartRoguePhase101ToyShapePass";
import "./CartRoguePhase102AnimeCutin";
import "./CartGameplayAuditRuntime";
import "./CartRenderAuditRuntime";

/**
 * Single bootstrap point for the phase-based runtime.
 *
 * The import order is behaviorally significant because each phase wraps the
 * previous implementation. Keeping the chain here prevents presentation code
 * from owning runtime composition and gives later refactors one explicit place
 * to verify or replace the wrapper stack.
 */
export const CART_ROGUE_RUNTIME_PHASE_ORDER = [
  "CartRoguePhase14Arenas",
  "CartRoguePhase14SurfacePass",
  "CartRoguePhase15Turbo",
  "CartRoguePhase22RamSweep",
  "CartRoguePhase16Flow",
  "CartRoguePhase17CombatEvolution",
  "CartRoguePhase19TargetArt",
  "CartRoguePhase19CreaturePolish",
  "CartRoguePhase19GroundCover",
  "CartRoguePhase19GardenPolish",
  "CartRoguePhase19ReferencePolish",
  "CartRoguePhase19ArtifactCleanup",
  "CartRoguePhase20DioramaQuality",
  "CartRoguePhase20ReferenceMatch",
  "CartRoguePhase22CameraComfort",
  "CartRoguePhase21ImpactPolish",
  "CartRoguePhase21WorldGrade",
  "CartRoguePhase23GateAndPivot",
  "CartRoguePhase24GroundMotion",
  "CartRoguePhase25TurboVisuals",
  "CartRoguePhase26StageIdentity",
  "CartRoguePhase27EnemyDamageVisuals",
  "CartRoguePhase28HeroSurface",
  "CartRoguePhase29SurfaceLife",
  "CartRoguePhase30EnemyBreakup",
  "CartRoguePhase31BossAtmosphere",
  "CartRoguePhase32NearCameraParticles",
  "CartRoguePhase33HandlingCombat",
  "CartRoguePhase34FloorDetail",
  "CartRoguePhase35MosaicDiorama",
  "CartRoguePhase36TraversalVisibility",
  "CartRoguePhase37MosaicColorPass",
  "CartRoguePhase39VertexColorPipeline",
  "CartRoguePhase42StaticInstanceColorRepair",
  "CartRoguePhase43ArchitectureVertexColors",
  "CartRoguePhase44RequestedFixes",
  "CartRoguePhase45StabilityGuidance",
  "CartRoguePhase46GroundPatternRecovery",
  "CartRoguePhase47TransitCompletion",
  "CartRoguePhase48RouteExitCompletion",
  "CartRoguePhase49HandlingContact",
  "CartRoguePhase50Arena03CenterClearance",
  "CartRoguePhase51Arena03Gate",
  "CartRoguePhase53Handling2",
  "CartRoguePhase54TurboAttack",
  "CartRoguePhase55TurboStrike",
  "CartRoguePhase56TurboSmash",
  "CartRoguePhase57FlowSurge",
  "CartRoguePhase58TurboBreakaway",
  "CartRoguePhase59TurboStrikeVisual",
  "CartRoguePhase60TurboCombatSafety",
  "CartRoguePhase61PerfectStrike",
  "CartRoguePhase62PerfectShockwave",
  "CartRoguePhase63TurboAimAssist",
  "CartRoguePhase64TurboHitStun",
  "CartRoguePhase65PerfectCombatVisual",
  "CartRoguePhase66TurboChainReward",
  "CartRoguePhase67TurboHunt",
  "CartRoguePhase67HuntRecoveryBounds",
  "CartRoguePhase74TurboHuntPerkMilestones",
  "CartRoguePhase78TurboHuntPresentationGuard",
  "CartRoguePhase79PerformanceBattery",
  "CartRoguePhase80EnvironmentRichness",
  "CartRoguePhase81EventDirector2",
  "CartRoguePhase82ImpactSpeed3",
  "CartRoguePhase83Boss2",
  "CartRoguePhase84ThreatDodge",
  "CartRoguePhase85PursuitEvents",
  "CartRoguePhase86BossPredator",
  "CartRoguePhase87ThreatPressure2",
  "CartRoguePhase88RaidHazards",
  "CartRoguePhase89HazardCombatDirector",
  "CartRoguePhase90TitanRaidBoss4",
  "CartRoguePhase91DamageFeedback2",
  "CartRoguePhase93ForcedDodgeTrajectory2",
  "CartRoguePhase94EscapeRhythmDirector2",
] as const;