<?php
require '/home/paddnols/private/pd_mon_config.php';
$pdo = pd_pdo();

// add 1 — done as a single DB instruction so two visitors at once can't clash
$pdo->query("UPDATE pd_counter SET hits = hits + 1 WHERE name = 'visits'");

// read the new total and send it back as JSON
$n = $pdo->query("SELECT hits FROM pd_counter WHERE name = 'visits'")->fetchColumn();
header('Content-Type: application/json');
echo json_encode(['visits' => (int)$n]);