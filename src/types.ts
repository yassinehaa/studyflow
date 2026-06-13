export interface User {
  id: number;
  username: string;
}

export interface Subject {
  id: number;
  name: string;
  exam_date: string;
}

export interface Topic {
  id: number;
  subject_id: number;
  name: string;
  difficulty: number;
  base_required_minutes: number;
  required_minutes: number;
  studied_minutes: number;
  remaining_minutes: number;
  predicted_completion_date: string | null;
  dynamic_priority: number;
  last_studied_at: string | null;
  is_completed: boolean;
  mastery_score: number;
  exam_date?: string; // Joined from subject
  subject_name?: string; // Joined from subject
}

export interface StudySession {
  id: number;
  user_id: number;
  topic_id: number;
  duration_minutes: number;
  created_at: string;
}

export interface Availability {
  day_of_week: number;
  hours: number;
}

export interface Risk {
  subjectId: number;
  subjectName: string;
  totalRequired: number;
  totalAvailable: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  riskPercent: number;
  daysLeft: number;
  weakTopics?: string;
}

export interface PlanItem {
  topicId: number;
  topicName: string;
  subjectName: string;
  hours: number;
}

export interface OptimizerData {
  todayPlan: PlanItem[];
  risks: Risk[];
  scoredTopics: any[];
  subjects: Subject[];
}
