import { randomUUID } from 'node:crypto';
import { dbService } from '../database/db.ts';
import { hashPassword } from '../utils/crypto.ts';
import { ingestionPipeline } from '../modules/ingestion/pipeline.ts';
import { logger } from '../utils/logger.ts';

export async function seedDatabase() {
  logger.info('Starting Nithu25 Database Seeding [DEMO DATA]...');
  const now = new Date().toISOString();

  // 1. Users
  const adminId = 'usr_admin_001';
  const studentId = 'usr_student_001';

  dbService.run(`
    INSERT OR IGNORE INTO users (id, email, password_hash, auth_provider, role, is_verified, is_active, created_at, updated_at)
    VALUES (?, 'admin@nithu25.edu', ?, 'local', 'ADMIN', 1, 1, ?, ?)
  `, [adminId, hashPassword('AdminPass123!'), now, now]);

  dbService.run(`
    INSERT OR IGNORE INTO profiles (id, user_id, name, created_at, updated_at)
    VALUES (?, ?, 'System Administrator [DEMO DATA]', ?, ?)
  `, [randomUUID(), adminId, now, now]);

  dbService.run(`
    INSERT OR IGNORE INTO users (id, email, password_hash, auth_provider, role, is_verified, is_active, created_at, updated_at)
    VALUES (?, 'student@nithu25.edu', ?, 'local', 'STUDENT', 1, 1, ?, ?)
  `, [studentId, hashPassword('StudentPass123!'), now, now]);

  dbService.run(`
    INSERT OR IGNORE INTO profiles (id, user_id, name, created_at, updated_at)
    VALUES (?, ?, 'Nithish Student [DEMO DATA]', ?, ?)
  `, [randomUUID(), studentId, now, now]);

  // 2. Academic Hierarchy: VIT [DEMO CONFIGURATION]
  const uniId = 'uni_vit_001';
  dbService.run(`
    INSERT OR IGNORE INTO universities (id, name, code, country, active, created_at)
    VALUES (?, 'Vellore Institute of Technology [DEMO CONFIG]', 'VIT', 'India', 1, ?)
  `, [uniId, now]);

  const campusId = 'cam_vit_vlr';
  dbService.run(`
    INSERT OR IGNORE INTO campuses (id, university_id, name, code, created_at)
    VALUES (?, ?, 'Vellore Campus [DEMO DATA]', 'VLR', ?)
  `, [campusId, uniId, now]);

  const deptId = 'dep_vit_scope';
  dbService.run(`
    INSERT OR IGNORE INTO departments (id, campus_id, name, code, created_at)
    VALUES (?, ?, 'School of Computer Science and Engineering [DEMO DATA]', 'SCOPE', ?)
  `, [deptId, campusId, now]);

  const progId = 'prg_vit_btech_cse';
  dbService.run(`
    INSERT OR IGNORE INTO programs (id, department_id, name, code, degree, created_at)
    VALUES (?, ?, 'B.Tech Computer Science and Engineering [DEMO DATA]', 'BTECH_CSE', 'B.Tech', ?)
  `, [progId, deptId, now]);

  const regId = 'reg_vit_2021';
  dbService.run(`
    INSERT OR IGNORE INTO regulations (id, university_id, name, code, year, created_at)
    VALUES (?, ?, '2021 Academic Regulation [DEMO DATA]', 'R2021', 2021, ?)
  `, [regId, uniId, now]);

  const semId = 'sem_vit_3';
  dbService.run(`
    INSERT OR IGNORE INTO semesters (id, program_id, name, number, created_at)
    VALUES (?, ?, 'Semester 3 [DEMO DATA]', 3, ?)
  `, [semId, progId, now]);

  const courseId = 'crs_dsa_001';
  dbService.run(`
    INSERT OR IGNORE INTO courses (id, semester_id, code, name, created_at)
    VALUES (?, ?, 'BCSE202L', 'Data Structures and Algorithms [DEMO DATA]', ?)
  `, [courseId, semId, now]);

  const subId = 'sub_dsa_001';
  dbService.run(`
    INSERT OR IGNORE INTO subjects (id, course_id, code, name, credits, created_at)
    VALUES (?, ?, 'BCSE202L', 'Data Structures and Algorithms [DEMO DATA]', 3, ?)
  `, [subId, courseId, now]);

  // Units
  const unit1Id = 'unt_dsa_1';
  const unit2Id = 'unt_dsa_2';
  const unit3Id = 'unt_dsa_3';
  const unit4Id = 'unt_dsa_4';
  const unit5Id = 'unt_dsa_5';

  dbService.run(`INSERT OR IGNORE INTO units (id, subject_id, number, name, description, created_at) VALUES (?, ?, 1, 'Introduction to Data Structures & Arrays [DEMO DATA]', 'Asymptotic notations, Arrays, Sparse matrix', ?)`, [unit1Id, subId, now]);
  dbService.run(`INSERT OR IGNORE INTO units (id, subject_id, number, name, description, created_at) VALUES (?, ?, 2, 'Stacks, Queues and Linked Lists [DEMO DATA]', 'Linear data structures, Infix to Postfix conversion, Circular Queue', ?)`, [unit2Id, subId, now]);
  dbService.run(`INSERT OR IGNORE INTO units (id, subject_id, number, name, description, created_at) VALUES (?, ?, 3, 'Trees and Binary Search Trees [DEMO DATA]', 'Tree traversals, BST insertions and deletions, AVL trees', ?)`, [unit3Id, subId, now]);
  dbService.run(`INSERT OR IGNORE INTO units (id, subject_id, number, name, description, created_at) VALUES (?, ?, 4, 'Graphs and Graph Algorithms [DEMO DATA]', 'Graph representations, BFS, DFS, Dijkstra algorithm, Prim and Kruskal', ?)`, [unit4Id, subId, now]);
  dbService.run(`INSERT OR IGNORE INTO units (id, subject_id, number, name, description, created_at) VALUES (?, ?, 5, 'Sorting, Searching and Hashing [DEMO DATA]', 'QuickSort, MergeSort, Hash functions, Collision resolution', ?)`, [unit5Id, subId, now]);

  // Topics
  const topicBstId = 'top_dsa_bst';
  const topicDijkstraId = 'top_dsa_dijkstra';
  const topicStackId = 'top_dsa_stack';
  const topicHashingId = 'top_dsa_hashing';

  dbService.run(`INSERT OR IGNORE INTO topics (id, unit_id, name, description, created_at) VALUES (?, ?, 'Binary Search Trees & AVL Rotations [DEMO DATA]', 'Operations on BST and self-balancing trees', ?)`, [topicBstId, unit3Id, now]);
  dbService.run(`INSERT OR IGNORE INTO topics (id, unit_id, name, description, created_at) VALUES (?, ?, 'Shortest Path & Dijkstra Algorithm [DEMO DATA]', 'Greedy single-source shortest path algorithm', ?)`, [topicDijkstraId, unit4Id, now]);
  dbService.run(`INSERT OR IGNORE INTO topics (id, unit_id, name, description, created_at) VALUES (?, ?, 'Stack Applications & Expression Evaluation [DEMO DATA]', 'Postfix conversion and stack evaluation', ?)`, [topicStackId, unit2Id, now]);
  dbService.run(`INSERT OR IGNORE INTO topics (id, unit_id, name, description, created_at) VALUES (?, ?, 'Hashing Techniques & Collision Resolution [DEMO DATA]', 'Linear probing, quadratic probing, and chaining', ?)`, [topicHashingId, unit5Id, now]);

  // 3. Question Paper 1 [DEMO DATA]
  const paper1Id = 'qp_demo_2025_fat';
  dbService.run(`
    INSERT OR IGNORE INTO question_papers (
      id, university_id, subject_id, regulation_id, semester_id, exam_type, academic_year,
      original_file_url, file_hash, processing_status, verification_status, metadata_json, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, 'FAT', '2024-2025',
      '/uploads/BCSE202L_FAT_2024_2025_SAMPLE.pdf', 'hash_sample_001', 'COMPLETED', 'VERIFIED',
      '{"notes": "DEMO DATA - Sample academic evaluation questions for testing system readiness"}', ?, ?
    )
  `, [paper1Id, uniId, subId, regId, semId, now, now]);

  const rawPaperText = `
PART A
Q1. Define asymptotic notations and explain Big-O with an example. [2 Marks]
Q2. What is a circular queue? State its advantage over linear queue. [2 Marks]
Q3. Explain the difference between Tree Traversal methods (Inorder, Preorder, Postorder). [2 Marks]
Q4. Define Binary Search Trees & AVL Rotations and explain why balancing is required. [2 Marks]
PART B
Q5. Design and construct an AVL tree by inserting keys: 15, 20, 24, 10, 13, 7, 30. Show all rotations. [10 Marks]
Q6. Explain Shortest Path & Dijkstra Algorithm with a step-by-step example on a weighted graph. [10 Marks]
Q7. Describe Stack Applications & Expression Evaluation and convert (A + B) * (C - D) into Postfix form. [5 Marks]
Q8. Discuss Hashing Techniques & Collision Resolution using linear probing and separate chaining. [5 Marks]
`;

  await ingestionPipeline.execute({
    paperId: paper1Id,
    rawText: rawPaperText,
    ocrConfidence: 'HIGH_CONFIDENCE',
  });

  // 4. Educational Resources [Approved sources only]
  dbService.run(`
    INSERT OR IGNORE INTO educational_resources (id, title, url, description, source_domain, resource_type, relevance, is_verified, created_at)
    VALUES (?, 'NPTEL Data Structures and Algorithms Course', 'https://nptel.ac.in/courses/106102064', 'Official Ministry of Education NPTEL video lectures and syllabus notes', 'nptel.ac.in', 'LECTURE', 0.98, 1, ?)
  `, [randomUUID(), now]);

  dbService.run(`
    INSERT OR IGNORE INTO educational_resources (id, title, url, description, source_domain, resource_type, relevance, is_verified, created_at)
    VALUES (?, 'VIT Official Academic Portal & Syllabus Reference', 'https://vit.ac.in/academics', 'Official university syllabus outlines and examination regulations', 'vit.ac.in', 'OFFICIAL_SITE', 0.99, 1, ?)
  `, [randomUUID(), now]);

  // 5. Source Registries
  dbService.run(`
    INSERT OR IGNORE INTO source_registries (id, name, base_url, category, allowed, automated_collection_allowed, robots_status, notes, active, created_at)
    VALUES (?, 'VIT Official Academic Portal', 'https://vit.ac.in', 'OFFICIAL', 1, 0, 'ALLOWED', 'Official university portal. Manual verified imports only.', 1, ?)
  `, [randomUUID(), now]);

  dbService.run(`
    INSERT OR IGNORE INTO source_registries (id, name, base_url, category, allowed, automated_collection_allowed, robots_status, notes, active, created_at)
    VALUES (?, 'VHelp Educational Community', 'https://vhelp.in', 'STUDENT_COMMUNITY', 1, 0, 'ALLOWED', 'Student community repository. Administrator review required.', 1, ?)
  `, [randomUUID(), now]);

  logger.info('Database seeded successfully with verified demonstration records [DEMO DATA].');
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seedDatabase().catch(err => {
    logger.error('Failed to seed database', err);
    process.exit(1);
  });
}
