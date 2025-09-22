# Voca AI Engine - AWS Infrastructure
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# VPC
resource "aws_vpc" "voca_vpc" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "voca-ai-vpc"
    Environment = var.environment
  }
}

# Internet Gateway
resource "aws_internet_gateway" "voca_igw" {
  vpc_id = aws_vpc.voca_vpc.id

  tags = {
    Name        = "voca-ai-igw"
    Environment = var.environment
  }
}

# Public Subnets
resource "aws_subnet" "public_subnets" {
  count = length(var.public_subnet_cidrs)

  vpc_id                  = aws_vpc.voca_vpc.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name        = "voca-ai-public-subnet-${count.index + 1}"
    Environment = var.environment
    Type        = "public"
  }
}

# Private Subnets
resource "aws_subnet" "private_subnets" {
  count = length(var.private_subnet_cidrs)

  vpc_id            = aws_vpc.voca_vpc.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name        = "voca-ai-private-subnet-${count.index + 1}"
    Environment = var.environment
    Type        = "private"
  }
}

# Route Table for Public Subnets
resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.voca_vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.voca_igw.id
  }

  tags = {
    Name        = "voca-ai-public-rt"
    Environment = var.environment
  }
}

# Route Table Association for Public Subnets
resource "aws_route_table_association" "public_rta" {
  count = length(aws_subnet.public_subnets)

  subnet_id      = aws_subnet.public_subnets[count.index].id
  route_table_id = aws_route_table.public_rt.id
}

# NAT Gateway
resource "aws_eip" "nat_eip" {
  count = length(aws_subnet.public_subnets)

  domain = "vpc"
  depends_on = [aws_internet_gateway.voca_igw]

  tags = {
    Name        = "voca-ai-nat-eip-${count.index + 1}"
    Environment = var.environment
  }
}

resource "aws_nat_gateway" "nat_gw" {
  count = length(aws_subnet.public_subnets)

  allocation_id = aws_eip.nat_eip[count.index].id
  subnet_id     = aws_subnet.public_subnets[count.index].id

  tags = {
    Name        = "voca-ai-nat-gw-${count.index + 1}"
    Environment = var.environment
  }

  depends_on = [aws_internet_gateway.voca_igw]
}

# Route Table for Private Subnets
resource "aws_route_table" "private_rt" {
  count = length(aws_subnet.private_subnets)

  vpc_id = aws_vpc.voca_vpc.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat_gw[count.index].id
  }

  tags = {
    Name        = "voca-ai-private-rt-${count.index + 1}"
    Environment = var.environment
  }
}

# Route Table Association for Private Subnets
resource "aws_route_table_association" "private_rta" {
  count = length(aws_subnet.private_subnets)

  subnet_id      = aws_subnet.private_subnets[count.index].id
  route_table_id = aws_route_table.private_rt[count.index].id
}

# Security Groups
resource "aws_security_group" "alb_sg" {
  name_prefix = "voca-ai-alb-sg"
  vpc_id      = aws_vpc.voca_vpc.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "voca-ai-alb-sg"
    Environment = var.environment
  }
}

resource "aws_security_group" "ecs_sg" {
  name_prefix = "voca-ai-ecs-sg"
  vpc_id      = aws_vpc.voca_vpc.id

  ingress {
    from_port       = 8008
    to_port         = 8008
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_sg.id]
  }

  ingress {
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_sg.id]
  }

  ingress {
    from_port       = 8001
    to_port         = 8001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_sg.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "voca-ai-ecs-sg"
    Environment = var.environment
  }
}

resource "aws_security_group" "rds_sg" {
  name_prefix = "voca-ai-rds-sg"
  vpc_id      = aws_vpc.voca_vpc.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_sg.id]
  }

  tags = {
    Name        = "voca-ai-rds-sg"
    Environment = var.environment
  }
}

# Application Load Balancer
resource "aws_lb" "voca_alb" {
  name               = "voca-ai-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_sg.id]
  subnets            = aws_subnet.public_subnets[*].id

  enable_deletion_protection = false

  tags = {
    Name        = "voca-ai-alb"
    Environment = var.environment
  }
}

# Target Groups
resource "aws_lb_target_group" "voca_ai_engine_tg" {
  name     = "voca-ai-engine-tg"
  port     = 8008
  protocol = "HTTP"
  vpc_id   = aws_vpc.voca_vpc.id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = "/health"
    matcher             = "200"
    port                = "traffic-port"
    protocol            = "HTTP"
  }

  tags = {
    Name        = "voca-ai-engine-tg"
    Environment = var.environment
  }
}

resource "aws_lb_target_group" "voca_os_tg" {
  name     = "voca-os-tg"
  port     = 3001
  protocol = "HTTP"
  vpc_id   = aws_vpc.voca_vpc.id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = "/health"
    matcher             = "200"
    port                = "traffic-port"
    protocol            = "HTTP"
  }

  tags = {
    Name        = "voca-os-tg"
    Environment = var.environment
  }
}

resource "aws_lb_target_group" "voca_connect_tg" {
  name     = "voca-connect-tg"
  port     = 8001
  protocol = "HTTP"
  vpc_id   = aws_vpc.voca_vpc.id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = "/health"
    matcher             = "200"
    port                = "traffic-port"
    protocol            = "HTTP"
  }

  tags = {
    Name        = "voca-connect-tg"
    Environment = var.environment
  }
}

# ALB Listeners
resource "aws_lb_listener" "voca_alb_listener" {
  load_balancer_arn = aws_lb.voca_alb.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Voca AI Engine - Service not found"
      status_code  = "404"
    }
  }
}

# ALB Listener Rules
resource "aws_lb_listener_rule" "voca_ai_engine_rule" {
  listener_arn = aws_lb_listener.voca_alb_listener.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.voca_ai_engine_tg.arn
  }

  condition {
    path_pattern {
      values = ["/voca-engine/*", "/docs", "/redoc", "/"]
    }
  }
}

resource "aws_lb_listener_rule" "voca_os_rule" {
  listener_arn = aws_lb_listener.voca_alb_listener.arn
  priority     = 200

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.voca_os_tg.arn
  }

  condition {
    path_pattern {
      values = ["/voca-os/*"]
    }
  }
}

resource "aws_lb_listener_rule" "voca_connect_rule" {
  listener_arn = aws_lb_listener.voca_alb_listener.arn
  priority     = 300

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.voca_connect_tg.arn
  }

  condition {
    path_pattern {
      values = ["/voca-connect/*", "/webhooks/*"]
    }
  }
}

# RDS Aurora Cluster
resource "aws_rds_cluster" "voca_rds" {
  cluster_identifier      = "voca-ai-cluster"
  engine                  = "aurora-postgresql"
  engine_version          = "15.4"
  database_name           = "voca_ai_db"
  master_username         = "voca_user"
  master_password         = var.db_password
  backup_retention_period = 7
  preferred_backup_window = "07:00-09:00"
  preferred_maintenance_window = "sun:05:00-sun:06:00"
  db_subnet_group_name    = aws_db_subnet_group.voca_db_subnet_group.name
  vpc_security_group_ids  = [aws_security_group.rds_sg.id]
  skip_final_snapshot     = true
  deletion_protection     = false

  tags = {
    Name        = "voca-ai-rds-cluster"
    Environment = var.environment
  }
}

resource "aws_rds_cluster_instance" "voca_rds_instances" {
  count              = 2
  identifier         = "voca-ai-cluster-${count.index}"
  cluster_identifier = aws_rds_cluster.voca_rds.id
  instance_class     = "db.t3.medium"
  engine             = aws_rds_cluster.voca_rds.engine
  engine_version     = aws_rds_cluster.voca_rds.engine_version

  tags = {
    Name        = "voca-ai-rds-instance-${count.index}"
    Environment = var.environment
  }
}

resource "aws_db_subnet_group" "voca_db_subnet_group" {
  name       = "voca-ai-db-subnet-group"
  subnet_ids = aws_subnet.private_subnets[*].id

  tags = {
    Name        = "voca-ai-db-subnet-group"
    Environment = var.environment
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "voca_cluster" {
  name = "voca-ai-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name        = "voca-ai-cluster"
    Environment = var.environment
  }
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "voca_logs" {
  for_each = toset(["voca-ai-engine", "voca-os", "voca-connect"])

  name              = "/ecs/${each.key}"
  retention_in_days = 30

  tags = {
    Name        = "voca-ai-${each.key}-logs"
    Environment = var.environment
  }
}

# IAM Roles
resource "aws_iam_role" "ecs_task_execution_role" {
  name = "ecsTaskExecutionRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "voca_ai_engine_task_role" {
  name = "voca-ai-engine-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "voca_ai_engine_task_policy" {
  name = "voca-ai-engine-task-policy"
  role = aws_iam_role.voca_ai_engine_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "*"
      }
    ]
  })
}
